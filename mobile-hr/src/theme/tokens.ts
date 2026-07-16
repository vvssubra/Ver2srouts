/**
 * Design tokens for the Sprout Staff app.
 *
 * Indigo is the established brand color for the staff/teacher side of the
 * product (see manifest-teachers.webmanifest, theme_color #4f46e5) — kept
 * as the anchor here for continuity with the existing web dashboard. The
 * mint/green accent is a restrained nod to the org-wide "Sprout" identity
 * without borrowing the parent app's cartoon mascot, which reads as a kids'
 * product rather than a staff tool.
 */

export const color = {
  ink: "#181726",
  inkMuted: "#6B6980",
  inkFaint: "#9997A8",

  paper: "#FAFAFC",
  surface: "#FFFFFF",
  border: "#E6E4EF",
  borderStrong: "#D3D0E0",

  primary: "#4F46E5",
  primaryDark: "#3A32B3",
  primarySoft: "#EEEDFC",

  accent: "#2F9E6E",
  accentSoft: "#E7F5EE",

  danger: "#D6425E",
  dangerSoft: "#FCEBEF",
} as const;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;
