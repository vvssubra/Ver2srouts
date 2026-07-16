import { describe, it, expect } from "vitest";
import {
  roleNavEntries,
  isGroup,
  isSubGroup,
  type NavEntry,
  type NavItem,
  type NavSubGroup,
} from "@/components/DashboardLayout";
import {
  filterNavEntries,
  getRawNavEntries,
  isPathAllowed,
  collectNavPaths,
} from "@/components/nav-filter";

const ALL_ROLES = [
  "super_admin",
  "franchisee",
  "admin",
  "staff",
  "teacher",
  "parent",
] as const;

function allPaths(entries: NavEntry[]): string[] {
  return collectNavPaths(entries);
}

describe("roleNavEntries registry", () => {
  it("defines an entry set (directly or via staff→admin fallback) for every AppRole", () => {
    for (const role of ALL_ROLES) {
      const raw = getRawNavEntries(role);
      expect(Array.isArray(raw), `${role} should resolve to an array`).toBe(true);
      expect(raw.length, `${role} should have at least one nav entry`).toBeGreaterThan(0);
    }
  });

  it("does NOT register a static nav for staff (uses admin superset)", () => {
    // The staff sidebar is entirely permission-driven. If someone adds a
    // static staff nav here it must be a conscious choice — this test fails
    // loudly so they re-read the access-group filtering contract.
    expect(roleNavEntries.staff).toBeUndefined();
    expect(getRawNavEntries("staff")).toBe(roleNavEntries.admin);
  });

  it("every NavItem has a non-empty path and label", () => {
    for (const role of Object.keys(roleNavEntries)) {
      for (const entry of roleNavEntries[role]) {
        const items: (NavItem | NavSubGroup)[] = isGroup(entry) ? entry.items : [entry as NavItem];
        for (const item of items) {
          if (isSubGroup(item)) {
            for (const child of item.items) {
              expect(child.path, `${role}: subgroup child missing path`).toBeTruthy();
              expect(child.label, `${role}: subgroup child missing label`).toBeTruthy();
            }
          } else {
            expect(item.path, `${role}: item missing path`).toBeTruthy();
            expect(item.label, `${role}: item missing label`).toBeTruthy();
          }
        }
      }
    }
  });
});

describe("isPathAllowed", () => {
  it("always permits /settings", () => {
    expect(isPathAllowed("/settings", [])).toBe(true);
  });

  it("uses prefix match for plain paths", () => {
    expect(isPathAllowed("/staff-attendance", ["/staff-attendance"])).toBe(true);
    expect(isPathAllowed("/staff-attendance/foo", ["/staff-attendance"])).toBe(true);
    expect(isPathAllowed("/leave", ["/staff-attendance"])).toBe(false);
  });

  it("requires exact match when either side has a query string", () => {
    expect(isPathAllowed("/newsletters?audience=staff", ["/newsletters?audience=staff"])).toBe(true);
    expect(isPathAllowed("/newsletters?audience=staff", ["/newsletters"])).toBe(false);
    expect(isPathAllowed("/newsletters", ["/newsletters?audience=staff"])).toBe(false);
  });
});

describe("filterNavEntries", () => {
  it("super_admin and franchisee bypass filtering and merging entirely", () => {
    for (const role of ["super_admin", "franchisee"] as const) {
      const filtered = filterNavEntries(role, ["/payroll"]);
      expect(filtered).toEqual(getRawNavEntries(role));
    }
  });

  it("non-staff roles keep their full static nav when no extras are granted", () => {
    for (const role of ["admin", "teacher", "parent"] as const) {
      const filtered = filterNavEntries(role, []);
      expect(filtered).toEqual(getRawNavEntries(role));
    }
  });

  it("appends extra granted modules to a teacher's static nav", () => {
    const base = collectNavPaths(getRawNavEntries("teacher"));
    expect(base).not.toContain("/payroll");
    const filtered = filterNavEntries("teacher", ["/payroll"]);
    const paths = collectNavPaths(filtered);
    // Static teacher items are preserved AND the extra grant shows up.
    for (const p of base) expect(paths).toContain(p);
    expect(paths).toContain("/payroll");
  });

  it("staff with empty allowedRoutes collapses to settings-only", () => {
    const filtered = filterNavEntries("staff", []);
    for (const path of allPaths(filtered)) {
      expect(path.startsWith("/settings")).toBe(true);
    }
  });

  it("staff is filtered from the admin superset by allowedRoutes", () => {
    const allowed = ["/crm", "/staff-attendance", "/leave"];
    const filtered = filterNavEntries("staff", allowed);
    const paths = allPaths(filtered);
    // At least one path per granted module survives.
    for (const route of allowed) {
      expect(
        paths.some((p) => p.startsWith(route)),
        `staff should see ${route}`,
      ).toBe(true);
    }
    // Routes that weren't granted must be filtered out.
    expect(paths.some((p) => p.startsWith("/payroll"))).toBe(false);
    expect(paths.some((p) => p.startsWith("/organizations"))).toBe(false);
  });

  it("drops groups whose items are all filtered out", () => {
    const filtered = filterNavEntries("admin", ["/crm"]);
    for (const entry of filtered) {
      if (isGroup(entry)) {
        expect(entry.items.length).toBeGreaterThan(0);
        for (const item of entry.items) {
          if (isSubGroup(item)) expect(item.items.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("never returns admin/franchisee-only modules to staff when not granted", () => {
    const sensitive = ["/organizations", "/payroll", "/finance", "/audit"];
    const filtered = filterNavEntries("staff", ["/dashboard"]);
    const paths = allPaths(filtered);
    for (const s of sensitive) {
      expect(paths.some((p) => p.startsWith(s))).toBe(false);
    }
  });
});