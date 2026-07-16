import {
  type NavEntry,
  type NavItem,
  type NavSubGroup,
  isGroup,
  isSubGroup,
  roleNavEntries,
} from "./DashboardLayout";

export type NavRole =
  | "super_admin"
  | "franchisee"
  | "admin"
  | "staff"
  | "teacher"
  | "parent";

/**
 * Pick the raw nav set for a role. Staff has no static nav of its own —
 * its menu is whatever the user's roles & permissions grant from the
 * admin superset. Unknown / null roles fall back to the parent nav.
 */
export function getRawNavEntries(role: NavRole | string | null | undefined): NavEntry[] {
  const key = role ?? "parent";
  return (
    roleNavEntries[key] ??
    (key === "staff" ? roleNavEntries.admin : roleNavEntries.parent)
  );
}

/** Match an item path against the user's allowed-routes list. */
export function isPathAllowed(itemPath: string, allowedRoutes: string[]): boolean {
  if (itemPath === "/settings") return true;
  return allowedRoutes.some((r) => {
    if (r.includes("?") || itemPath.includes("?")) return r === itemPath;
    return itemPath.startsWith(r);
  });
}

/**
 * Apply the same filtering the sidebar uses: super_admin and franchisee
 * see every entry; all other roles are narrowed by `allowedRoutes`.
 * Empty groups (no surviving items) are dropped.
 */
export function filterNavEntries(
  role: NavRole | string | null | undefined,
  allowedRoutes: string[],
): NavEntry[] {
  const raw = getRawNavEntries(role);
  // Bypass roles see the full nav, no filtering, no merging.
  if (role === "super_admin" || role === "franchisee") return raw;

  // Every role except `staff` ships with its own curated static nav and
  // is NOT narrowed by allowedRoutes (otherwise a teacher with no extra
  // access groups would see an empty sidebar). Instead, we *append* any
  // extra modules an admin granted via Roles & Permissions that aren't
  // already in the static nav — so granting Payroll to a teacher makes
  // Payroll appear in their sidebar immediately.
  if (role !== "staff") {
    return mergeExtraGrants(raw, allowedRoutes);
  }

  // Staff: assemble entirely from the admin superset based on grants.
  // Communication Hub is a company-wide read surface — every staff user
  // sees Announcements + Newsletter in the sidebar, even when their
  // access group doesn't explicitly grant those routes. Management is
  // gated inside each page (super_admin / franchisee / HR group).
  const COMMS_HUB_ALWAYS_VISIBLE = new Set(["/announcements", "/newsletters"]);
  const isAllowed = (path: string) =>
    COMMS_HUB_ALWAYS_VISIBLE.has(path) || isPathAllowed(path, allowedRoutes);
  return raw
    .map((entry) => {
      if (isGroup(entry)) {
        const filteredItems = entry.items
          .map((item) => {
            if (isSubGroup(item)) {
              const filtered = item.items.filter((i) => isAllowed(i.path));
              if (filtered.length === 0) return null;
              return { ...item, items: filtered };
            }
            if (isAllowed(item.path)) return item;
            return null;
          })
          .filter(Boolean) as (NavItem | NavSubGroup)[];
        if (filteredItems.length === 0) return null;
        return { ...entry, items: filteredItems };
      }
      if (isAllowed(entry.path)) return entry;
      return null;
    })
    .filter(Boolean) as NavEntry[];
}

/**
 * Append entries from the admin superset for any allowedRoutes path the
 * user's static nav doesn't already include. Merges into matching groups
 * when possible, or appends standalone items otherwise.
 */
function mergeExtraGrants(staticNav: NavEntry[], allowedRoutes: string[]): NavEntry[] {
  if (!allowedRoutes || allowedRoutes.length === 0) return staticNav;

  // Paths already present in the static nav — skip these.
  const existing = new Set(collectNavPaths(staticNav));

  // Admin superset, filtered down to just the extra-granted entries.
  const adminRaw = roleNavEntries.admin ?? [];
  const extras: NavEntry[] = [];

  for (const entry of adminRaw) {
    if (isGroup(entry)) {
      const extraItems: (NavItem | NavSubGroup)[] = [];
      for (const item of entry.items) {
        if (isSubGroup(item)) {
          const kids = item.items.filter(
            (i) => !existing.has(i.path) && isPathAllowed(i.path, allowedRoutes),
          );
          if (kids.length) extraItems.push({ ...item, items: kids });
        } else if (!existing.has(item.path) && isPathAllowed(item.path, allowedRoutes)) {
          extraItems.push(item);
        }
      }
      if (extraItems.length) extras.push({ ...entry, items: extraItems });
    } else if (!existing.has(entry.path) && isPathAllowed(entry.path, allowedRoutes)) {
      extras.push(entry);
    }
  }

  if (extras.length === 0) return staticNav;

  // Merge: fold extras into same-named groups already in static nav,
  // otherwise append at the end so the static order stays stable.
  const merged: NavEntry[] = staticNav.map((e) => (isGroup(e) ? { ...e, items: [...e.items] } : e));
  const groupIndex = new Map<string, number>();
  merged.forEach((e, idx) => {
    if (isGroup(e)) groupIndex.set(e.group, idx);
  });

  for (const extra of extras) {
    if (isGroup(extra)) {
      const idx = groupIndex.get(extra.group);
      if (idx !== undefined) {
        const target = merged[idx] as NavGroupMut;
        target.items = [...target.items, ...extra.items];
      } else {
        merged.push(extra);
      }
    } else {
      merged.push(extra);
    }
  }
  return merged;
}

type NavGroupMut = { group: string; icon: any; items: (NavItem | NavSubGroup)[] };

/** Flatten a group's items (including subgroups) into a flat NavItem list. */
export function flattenEntry(entry: NavEntry): NavItem[] {
  if (!isGroup(entry)) return [entry];
  const out: NavItem[] = [];
  for (const item of entry.items) {
    if (isSubGroup(item)) out.push(...item.items);
    else out.push(item);
  }
  return out;
}

export function collectNavPaths(entries: NavEntry[]): string[] {
  return entries.flatMap(flattenEntry).map((i) => i.path);
}