import { describe, it, expect } from "vitest";
import {
  DEFAULT_CLASS_OPTIONS,
  resolveAnnouncementRecipients,
  resolveBranchClassNames,
} from "@/lib/announcement-targets";

// ---- Minimal in-memory Supabase-like fake ----------------------------------
//
// Only implements the chain shapes actually used by the helper:
//   from(table).select(cols).eq(col, val)
//   from(table).select(cols).eq(col, val).eq(col, val)
//   from(table).select(cols).eq(col, val).not(col, "is", null)
//   from(table).select(cols).in(col, values)
//
// Each terminal returns a thenable that resolves to `{ data }`.

type Row = Record<string, any>;
type TableMap = Record<string, Row[]>;

function makeFakeSupabase(tables: TableMap) {
  function query(rows: Row[]) {
    const chain: any = {
      _rows: rows,
      select(_cols: string) {
        return chain;
      },
      eq(col: string, val: any) {
        chain._rows = chain._rows.filter((r: Row) => r[col] === val);
        return chain;
      },
      in(col: string, values: any[]) {
        const set = new Set(values);
        chain._rows = chain._rows.filter((r: Row) => set.has(r[col]));
        return chain;
      },
      not(col: string, _op: string, _val: any) {
        chain._rows = chain._rows.filter(
          (r: Row) => r[col] !== null && r[col] !== undefined
        );
        return chain;
      },
      // Make the chain awaitable => resolves to { data }
      then(onFulfilled: (v: { data: Row[] }) => any) {
        return Promise.resolve({ data: chain._rows }).then(onFulfilled);
      },
    };
    return chain;
  }
  return {
    from(table: string) {
      const rows = [...(tables[table] ?? [])];
      return query(rows);
    },
  };
}

const BRANCH_LGH = "lgh-branch";
const BRANCH_EMPTY = "empty-branch";

// Mirrors the real Little Green Hearts branch: 7 classes, some parents linked
// to students across different classes.
const seedTables: TableMap = {
  classes: [
    { branch_id: BRANCH_LGH, class_name: "Kindergarten 1 (K1)" },
    { branch_id: BRANCH_LGH, class_name: "Kindergarten 2 (K2)" },
    { branch_id: BRANCH_LGH, class_name: "Nursery 1 (N1)" },
    { branch_id: BRANCH_LGH, class_name: "Nursery 2 (N2)" },
    { branch_id: BRANCH_LGH, class_name: "Playhouse 1 (PH1)" },
    { branch_id: BRANCH_LGH, class_name: "Playhouse 2 (PH2)" },
    { branch_id: BRANCH_LGH, class_name: "Test" },
    // Other-branch classes must NOT leak into LGH.
    { branch_id: "other", class_name: "Should Not Appear" },
  ],
  students: [
    { id: "stu-k1-a", branch_id: BRANCH_LGH, class_name: "Kindergarten 1 (K1)" },
    { id: "stu-k1-b", branch_id: BRANCH_LGH, class_name: "Kindergarten 1 (K1)" },
    { id: "stu-n1-a", branch_id: BRANCH_LGH, class_name: "Nursery 1 (N1)" },
    { id: "stu-test", branch_id: BRANCH_LGH, class_name: "Test" },
    { id: "stu-null", branch_id: BRANCH_LGH, class_name: null },
    { id: "stu-other", branch_id: "other", class_name: "Nursery 1 (N1)" },
  ],
  parent_students: [
    { parent_id: "parent-1", student_id: "stu-k1-a" },
    { parent_id: "parent-2", student_id: "stu-k1-b" },
    // parent-1 has TWO kids in K1 — must not be duplicated.
    { parent_id: "parent-1", student_id: "stu-k1-b" },
    { parent_id: "parent-3", student_id: "stu-n1-a" },
    { parent_id: "parent-4", student_id: "stu-test" },
    // Parent linked to a student in another branch — must not appear.
    { parent_id: "parent-other", student_id: "stu-other" },
  ],
};

const branchStaff = [
  { id: "staff-1", email: "a@lgh" },
  { id: "staff-2", email: "b@lgh" },
  { id: "staff-3", email: "c@lgh" },
];

const branchParents = [
  { id: "parent-1", email: "p1@ex.com" },
  { id: "parent-2", email: "p2@ex.com" },
  { id: "parent-3", email: "p3@ex.com" },
  { id: "parent-4", email: "p4@ex.com" },
];

// ---- Tests ------------------------------------------------------------------

describe("resolveBranchClassNames", () => {
  it("returns exactly the classes registered for the branch, alphabetically sorted", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const names = await resolveBranchClassNames(supabase, BRANCH_LGH);
    expect(names).toEqual([
      "Kindergarten 1 (K1)",
      "Kindergarten 2 (K2)",
      "Nursery 1 (N1)",
      "Nursery 2 (N2)",
      "Playhouse 1 (PH1)",
      "Playhouse 2 (PH2)",
      "Test",
    ]);
  });

  it("does not leak classes from other branches", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const names = await resolveBranchClassNames(supabase, BRANCH_LGH);
    expect(names).not.toContain("Should Not Appear");
  });

  it("falls back to distinct student class_name when the branch has no classes registered", async () => {
    const supabase = makeFakeSupabase({
      classes: [],
      students: [
        { id: "s1", branch_id: BRANCH_EMPTY, class_name: "Alpha" },
        { id: "s2", branch_id: BRANCH_EMPTY, class_name: "Alpha" },
        { id: "s3", branch_id: BRANCH_EMPTY, class_name: "Beta" },
        { id: "s4", branch_id: BRANCH_EMPTY, class_name: null },
      ],
    });
    const names = await resolveBranchClassNames(supabase, BRANCH_EMPTY);
    expect(names).toEqual(["Alpha", "Beta"]);
  });

  it("uses DEFAULT_CLASS_OPTIONS when both classes and students are empty", async () => {
    const supabase = makeFakeSupabase({ classes: [], students: [] });
    const names = await resolveBranchClassNames(supabase, BRANCH_EMPTY);
    expect(names).toEqual(DEFAULT_CLASS_OPTIONS);
  });
});

describe("resolveAnnouncementRecipients", () => {
  it("staff_all -> every staff id in the branch, no parents", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "staff_all",
      branchId: BRANCH_LGH,
      branchStaff,
      branchParents,
    });
    expect(new Set(ids)).toEqual(new Set(["staff-1", "staff-2", "staff-3"]));
    for (const p of branchParents) expect(ids).not.toContain(p.id);
  });

  it("staff_specific -> only the selected staff", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "staff_specific",
      branchId: BRANCH_LGH,
      selectedStaffIds: ["staff-2"],
      branchStaff,
    });
    expect(ids).toEqual(["staff-2"]);
  });

  it("parents_all -> every parent in the branch, deduped, no staff", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "parents_all",
      branchId: BRANCH_LGH,
      branchStaff,
      branchParents,
    });
    expect(new Set(ids)).toEqual(
      new Set(["parent-1", "parent-2", "parent-3", "parent-4"])
    );
    for (const s of branchStaff) expect(ids).not.toContain(s.id);
  });

  it("parents_specific -> only the selected parents", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "parents_specific",
      branchId: BRANCH_LGH,
      selectedParentIds: ["parent-3", "parent-4"],
      branchParents,
    });
    expect(new Set(ids)).toEqual(new Set(["parent-3", "parent-4"]));
  });

  it("parents_class -> only parents of students in that class, deduped, branch-scoped", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "parents_class",
      branchId: BRANCH_LGH,
      targetClass: "Kindergarten 1 (K1)",
    });
    // parent-1 (linked twice to K1 kids) must appear once; parent-2 also in K1;
    // parent-3 (N1), parent-4 (Test), parent-other (other branch) excluded.
    expect(new Set(ids)).toEqual(new Set(["parent-1", "parent-2"]));
    expect(ids).not.toContain("parent-3");
    expect(ids).not.toContain("parent-4");
    expect(ids).not.toContain("parent-other");
  });

  it("parents_class with a class that has no students -> empty list", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "parents_class",
      branchId: BRANCH_LGH,
      targetClass: "Playhouse 2 (PH2)", // registered class, no students seeded
    });
    expect(ids).toEqual([]);
  });

  it("parents_class without a targetClass -> empty (guards accidental broadcast)", async () => {
    const supabase = makeFakeSupabase(seedTables);
    const ids = await resolveAnnouncementRecipients(supabase, {
      targetType: "parents_class",
      branchId: BRANCH_LGH,
    });
    expect(ids).toEqual([]);
  });
});