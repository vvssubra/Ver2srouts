// Centralized helpers for Taska (childcare) vs Preschool program awareness.
// Used across Students, Classes, Timetables, Planners, Dashboards, Fee Packages.

export type ProgramType = "taska" | "preschool";

export const AGE_GROUP_OPTIONS = [
  "1 Tahun",
  "2 Tahun",
  "3 Tahun",
  "4 Tahun",
  "5 Tahun",
  "6 Tahun",
  "Mixed",
] as const;

const TASKA_AGE_GROUPS = new Set<string>(["1 Tahun", "2 Tahun"]);

export const isTaskaAgeGroup = (ageGroup?: string | null): boolean =>
  !!ageGroup && TASKA_AGE_GROUPS.has(ageGroup);

export const inferProgramType = (ageGroup?: string | null): ProgramType =>
  isTaskaAgeGroup(ageGroup) ? "taska" : "preschool";

export const PROGRAM_OPTIONS: { value: ProgramType; label: string }[] = [
  { value: "preschool", label: "Preschool (Tadika)" },
  { value: "taska", label: "Taska (Childcare)" },
];

export const programLabel = (p?: string | null): string =>
  p === "taska" ? "Taska" : "Preschool";

// shadcn Badge variant for at-a-glance differentiation.
export const programBadgeVariant = (
  p?: string | null
): "default" | "secondary" | "outline" =>
  p === "taska" ? "secondary" : "outline";