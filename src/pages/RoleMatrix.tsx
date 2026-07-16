import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  MODULE_GROUPS,
  NON_MANAGEABLE,
  STARTER_ROLE_PRESETS,
  expandRouteWithChildren,
  manageablePathsForGroup,
  pathsForGroup,
  type ModuleGroup,
} from "@/lib/permissions/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Loader2, Plus, Users, Trash2, Sparkles, ChevronDown, ChevronRight, Eye, Pencil, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
// UserAccountsPanel moved to its own /admin/temp-password page.

/** Tell every open tab (including this one) to re-pull allowed routes. */
function broadcastPermissionsChanged() {
  try {
    localStorage.setItem("sprouts:permissions_version", String(Date.now()));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("sprouts:permissions-changed"));
  } catch {}
}

type AccessGroupRow = {
  id: string;
  name: string;
  description: string | null;
  branch_id: string;
  allowed_routes: string[];
  managed_routes: string[];
  is_active: boolean;
};

type CellState = "none" | "view" | "manage";

function cellStateFor(group: ModuleGroup, role: AccessGroupRow): CellState {
  const allowed = new Set(role.allowed_routes ?? []);
  const managed = new Set(role.managed_routes ?? []);
  const allPaths = pathsForGroup(group);
  const manageablePaths = manageablePathsForGroup(group);

  const allViewed = allPaths.length > 0 && allPaths.every((p) => allowed.has(p));
  const anyViewed = allPaths.some((p) => allowed.has(p));

  if (!anyViewed) return "none";

  const allManaged =
    manageablePaths.length > 0 && manageablePaths.every((p) => managed.has(p));
  if (allViewed && allManaged) return "manage";
  return "view";
}

function rotateCellState(state: CellState): CellState {
  if (state === "none") return "view";
  if (state === "view") return "manage";
  return "none";
}

function applyCellState(
  role: AccessGroupRow,
  group: ModuleGroup,
  next: CellState,
): Pick<AccessGroupRow, "allowed_routes" | "managed_routes"> {
  const allowed = new Set(role.allowed_routes ?? []);
  const managed = new Set(role.managed_routes ?? []);
  const allPaths = pathsForGroup(group);
  const manageablePaths = manageablePathsForGroup(group);

  if (next === "none") {
    for (const p of allPaths) allowed.delete(p);
    for (const p of manageablePaths) managed.delete(p);
  } else if (next === "view") {
    for (const p of allPaths) allowed.add(p);
    for (const p of manageablePaths) managed.delete(p);
  } else {
    for (const p of allPaths) allowed.add(p);
    for (const p of manageablePaths) managed.add(p);
  }

  return { allowed_routes: [...allowed], managed_routes: [...managed] };
}

function cellLabel(state: CellState): string {
  if (state === "view") return "View";
  if (state === "manage") return "Manage";
  return "—";
}

function cellClasses(state: CellState): string {
  if (state === "view")
    return "bg-[hsl(var(--role-teacher)/0.12)] text-[hsl(var(--role-teacher))] hover:bg-[hsl(var(--role-teacher)/0.2)] border-[hsl(var(--role-teacher)/0.3)]";
  if (state === "manage")
    return "bg-[hsl(var(--role-admin)/0.15)] text-[hsl(var(--role-admin))] hover:bg-[hsl(var(--role-admin)/0.25)] border-[hsl(var(--role-admin)/0.3)]";
  return "bg-muted/30 text-muted-foreground hover:bg-muted border-border";
}

/** Group rows by name so the matrix shows one row per logical role even
 * when the role is duplicated across branches. */
function groupByName(rows: AccessGroupRow[]) {
  const map = new Map<string, AccessGroupRow[]>();
  for (const r of rows) {
    if (!map.has(r.name)) map.set(r.name, []);
    map.get(r.name)!.push(r);
  }
  return [...map.entries()].map(([name, branches]) => ({ name, branches }));
}

export default function RoleMatrix() {
  const { role: myRole } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [detailRoleId, setDetailRoleId] = useState<string | null>(null);
  const [membersRoleName, setMembersRoleName] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);

  const canEdit = myRole === "super_admin" || myRole === "franchisee";

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["role-matrix-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_groups")
        .select("id,name,description,branch_id,allowed_routes,managed_routes,is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AccessGroupRow[];
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["role-matrix-branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["role-matrix-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_group_members")
        .select("id, group_id, user_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Scope rows to the active branch when one is picked; "all" shows every branch.
  const scopedRoles = useMemo(
    () =>
      selectedBranchId && selectedBranchId !== "all"
        ? roles.filter((r) => r.branch_id === selectedBranchId)
        : roles,
    [roles, selectedBranchId],
  );

  const grouped = useMemo(() => groupByName(scopedRoles), [scopedRoles]);

  // Member counts keyed by role name (sums across branches the role exists in).
  const memberCountByName = useMemo(() => {
    const idsByName = new Map<string, Set<string>>();
    for (const r of scopedRoles) {
      if (!idsByName.has(r.name)) idsByName.set(r.name, new Set());
      idsByName.get(r.name)!.add(r.id);
    }
    const out = new Map<string, number>();
    for (const [name, ids] of idsByName) {
      out.set(name, members.filter((m: any) => ids.has(m.group_id)).length);
    }
    return out;
  }, [members, scopedRoles]);

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: {
      ids: string[];
      allowed_routes: string[];
      managed_routes: string[];
    }) => {
      const { error } = await supabase
        .from("access_groups")
        .update({
          allowed_routes: payload.allowed_routes,
          managed_routes: payload.managed_routes,
        } as any)
        .in("id", payload.ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-matrix-groups"] });
      broadcastPermissionsChanged();
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleCellClick = (
    roleName: string,
    rows: AccessGroupRow[],
    group: ModuleGroup,
  ) => {
    if (!canEdit) return;
    // Use the first row's current state to decide the next state; apply to
    // every branch-clone of this role so the matrix stays consistent.
    const next = rotateCellState(cellStateFor(group, rows[0]));
    const updates = rows.map((r) => ({
      id: r.id,
      ...applyCellState(r, group, next),
    }));
    // Group ids by identical payload to minimise round-trips.
    updateRoleMutation.mutate({
      ids: updates.map((u) => u.id),
      allowed_routes: updates[0].allowed_routes,
      managed_routes: updates[0].managed_routes,
    });
    toast({
      title: `${roleName} • ${group.label}`,
      description: `Set to ${next === "none" ? "no access" : next === "view" ? "view" : "view + manage"}.`,
    });
  };

  // Detail drawer state derives a single row (the active-branch version, or
  // the first one if multi-branch) for editing per-page toggles.
  const detailRow = useMemo(
    () => scopedRoles.find((r) => r.id === detailRoleId) ?? null,
    [scopedRoles, detailRoleId],
  );

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Roles & Permissions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create staff roles and choose which modules each role can view or manage.
              HR can then assign these roles to staff during onboarding.
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              {roles.length === 0 && (
                <Button variant="outline" onClick={() => setSeedOpen(true)}>
                  <Sparkles className="w-4 h-4 mr-2" /> Seed starter roles
                </Button>
              )}
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> New role
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Permission matrix</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No roles yet. {canEdit && "Use Seed starter roles or New role to get going."}
              </div>
            ) : (
              <div className="w-full overflow-x-auto -mx-2 px-2 touch-pan-x [-webkit-overflow-scrolling:touch]">
                <div className="min-w-max">
                  <div
                    className="grid sticky top-0 bg-background z-10 border-b text-xs font-medium text-muted-foreground"
                    style={{
                      gridTemplateColumns: `220px repeat(${MODULE_GROUPS.length}, minmax(110px, 1fr))`,
                    }}
                  >
                    <div className="px-3 py-2">Role</div>
                    {MODULE_GROUPS.map((g) => (
                      <div key={g.key} className="px-2 py-2 text-center">
                        {g.label}
                      </div>
                    ))}
                  </div>
                  {grouped.map(({ name, branches: rows }) => (
                    <div
                      key={name}
                      className="grid border-b last:border-b-0 hover:bg-muted/20"
                      style={{
                        gridTemplateColumns: `220px repeat(${MODULE_GROUPS.length}, minmax(110px, 1fr))`,
                      }}
                    >
                      <div className="px-3 py-2 flex flex-col gap-1 justify-center">
                        <button
                          type="button"
                          className="text-left font-medium text-sm hover:underline"
                          onClick={() => setDetailRoleId(rows[0].id)}
                        >
                          {name}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => setMembersRoleName(name)}
                        >
                          <Users className="w-3 h-3" />
                          {memberCountByName.get(name) ?? 0} member
                          {(memberCountByName.get(name) ?? 0) === 1 ? "" : "s"}
                          {rows.length > 1 && (
                            <span className="ml-1">· {rows.length} branches</span>
                          )}
                        </button>
                      </div>
                      {MODULE_GROUPS.map((g) => {
                        const state = cellStateFor(g, rows[0]);
                        return (
                          <button
                            key={g.key}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleCellClick(name, rows, g)}
                            className={cn(
                              "m-1 rounded-md border text-xs font-medium py-2 px-1 transition",
                              cellClasses(state),
                              !canEdit && "cursor-default opacity-70",
                            )}
                            title={
                              canEdit
                                ? "Click to cycle: View → Manage → None"
                                : undefined
                            }
                          >
                            {cellLabel(state)}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 sm:hidden">
                  Swipe left/right to see all modules →
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className={cn("w-4 h-4 rounded border", cellClasses("view"))} />
                View — sees pages in the sidebar
              </span>
              <span className="inline-flex items-center gap-2">
                <span className={cn("w-4 h-4 rounded border", cellClasses("manage"))} />
                Manage — can edit / write
              </span>
              <span className="inline-flex items-center gap-2">
                <span className={cn("w-4 h-4 rounded border", cellClasses("none"))} />
                No access
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-role detail drawer with per-page toggles */}
      <RoleDetailDrawer
        row={detailRow}
        allBranchRows={scopedRoles.filter((r) => detailRow && r.name === detailRow.name)}
        canEdit={canEdit}
        onClose={() => setDetailRoleId(null)}
        onSaved={() =>
          queryClient.invalidateQueries({ queryKey: ["role-matrix-groups"] })
        }
      />

      {/* Members drawer */}
      <RoleMembersDrawer
        roleName={membersRoleName}
        rows={scopedRoles.filter((r) => r.name === membersRoleName)}
        members={members}
        onClose={() => setMembersRoleName(null)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["role-matrix-members"] });
          broadcastPermissionsChanged();
        }}
      />

      {/* New role */}
      <CreateRoleDialog
        open={createOpen}
        branches={branches}
        defaultBranchId={selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null}
        onClose={() => setCreateOpen(false)}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["role-matrix-groups"] })
        }
      />

      {/* Seed starters */}
      <SeedRolesDialog
        open={seedOpen}
        branches={branches}
        defaultBranchId={selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null}
        onClose={() => setSeedOpen(false)}
        onSeeded={() =>
          queryClient.invalidateQueries({ queryKey: ["role-matrix-groups"] })
        }
      />
    </DashboardLayout>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Detail drawer: per-module + per-page toggles for one role
 * ──────────────────────────────────────────────────────────────────────── */

function RoleDetailDrawer({
  row,
  allBranchRows,
  canEdit,
  onClose,
  onSaved,
}: {
  row: AccessGroupRow | null;
  allBranchRows: AccessGroupRow[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<{
    allowed: Set<string>;
    managed: Set<string>;
  } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applyToAllBranches, setApplyToAllBranches] = useState(true);

  // Reset draft whenever a different role is opened.
  useMemoOnChange(row?.id, () => {
    if (row) {
      setDraft({
        allowed: new Set(row.allowed_routes ?? []),
        managed: new Set(row.managed_routes ?? []),
      });
      setExpanded({});
    } else {
      setDraft(null);
    }
  });

  const handleSave = async () => {
    if (!row || !draft) return;
    const targetIds = applyToAllBranches
      ? allBranchRows.map((r) => r.id)
      : [row.id];
    const { error } = await supabase
      .from("access_groups")
      .update({
        allowed_routes: [...draft.allowed],
        managed_routes: [...draft.managed],
      } as any)
      .in("id", targetIds);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    broadcastPermissionsChanged();
    toast({ title: "Role updated", description: `${row.name} saved.` });
    onSaved();
    onClose();
  };

  const togglePath = (path: string, mode: "view" | "manage") => {
    if (!draft) return;
    const allowed = new Set(draft.allowed);
    const managed = new Set(draft.managed);
    const all = expandRouteWithChildren(path);
    if (mode === "view") {
      const enabling = !allowed.has(path);
      for (const p of all) {
        if (enabling) allowed.add(p);
        else {
          allowed.delete(p);
          managed.delete(p);
        }
      }
    } else {
      const enabling = !managed.has(path);
      for (const p of all) {
        if (enabling) {
          allowed.add(p);
          if (!NON_MANAGEABLE.has(p)) managed.add(p);
        } else {
          managed.delete(p);
        }
      }
    }
    setDraft({ allowed, managed });
  };

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="p-6 pb-3 border-b">
          <SheetTitle>{row?.name ?? "Role"}</SheetTitle>
          <SheetDescription>
            {row?.description || "Toggle view/manage per module. Expand a module for per-page control."}
          </SheetDescription>
          <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span><strong>View</strong> — page appears in the sidebar (read-only).</span>
            </div>
            <div className="flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5 shrink-0" />
              <span><strong>Edit</strong> — can create, update, approve. Turning Edit on also grants View.</span>
            </div>
            <p className="text-muted-foreground pt-1">
              Example: to give a staff only the clock in/out screen, expand <em>HR &amp; Workforce</em> and turn on
              <strong> View</strong> for <em>Staff Attendance</em>. Leave Edit off.
            </p>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-3">
            {MODULE_GROUPS.map((g) => {
              const isOpen = !!expanded[g.key];
              return (
                <div key={g.key} className="rounded-lg border">
                  <button
                    type="button"
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/40"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))
                    }
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      {g.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.items.length} page{g.items.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  {isOpen && draft && (
                    <div className="border-t divide-y">
                      <div className="px-3 py-1.5 flex items-center justify-end gap-4 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> View</span>
                        <span className="flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</span>
                      </div>
                      {g.items.map((item) => {
                        const allowedOn = draft.allowed.has(item.path);
                        const managedOn = draft.managed.has(item.path);
                        const manageable = !NON_MANAGEABLE.has(item.path);
                        return (
                          <div
                            key={item.path}
                            className="px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm">{item.label}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {item.path}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-1.5 text-xs">
                                <Eye className="w-3.5 h-3.5" />
                                <Switch
                                  disabled={!canEdit}
                                  checked={allowedOn}
                                  onCheckedChange={() => togglePath(item.path, "view")}
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-xs">
                                <Pencil className="w-3.5 h-3.5" />
                                <Switch
                                  disabled={!canEdit || !manageable}
                                  checked={managedOn}
                                  onCheckedChange={() => togglePath(item.path, "manage")}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <SheetFooter className="p-6 pt-3 border-t flex-row items-center justify-between sm:justify-between gap-3">
          {allBranchRows.length > 1 ? (
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={applyToAllBranches}
                onCheckedChange={setApplyToAllBranches}
              />
              Apply to all {allBranchRows.length} branches
            </label>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canEdit}>
              Save changes
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* Tiny helper: run a side-effect when `key` changes (avoids importing useEffect just here). */
function useMemoOnChange(key: unknown, effect: () => void) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useMemo(() => {
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Members drawer
 * ──────────────────────────────────────────────────────────────────────── */

function RoleMembersDrawer({
  roleName,
  rows,
  members,
  onClose,
  onChanged,
}: {
  roleName: string | null;
  rows: AccessGroupRow[];
  members: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data: candidates = [] } = useQuery({
    queryKey: ["role-matrix-candidate-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Only users who have a non-parent role should be assignable to staff role
  // groups. Parents (and any future non-staff principals) must not appear.
  const { data: userRoles = [] } = useQuery({
    queryKey: ["role-matrix-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Scope candidates to users who belong to the same branch(es) as the role.
  const { data: branchMems = [] } = useQuery({
    queryKey: ["role-matrix-branch-memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_memberships")
        .select("user_id, branch_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffUserIds = useMemo(() => {
    const byUser = new Map<string, Set<string>>();
    for (const r of userRoles as any[]) {
      const s = byUser.get(r.user_id) ?? new Set<string>();
      s.add(r.role);
      byUser.set(r.user_id, s);
    }
    const out = new Set<string>();
    for (const [uid, rs] of byUser) {
      // Staff = anyone with at least one non-parent role
      if ([...rs].some((x) => x !== "parent")) out.add(uid);
    }
    return out;
  }, [userRoles]);

  const roleBranchIds = useMemo(
    () => new Set(rows.map((r) => r.branch_id).filter(Boolean)),
    [rows],
  );

  const branchScopedUserIds = useMemo(() => {
    if (roleBranchIds.size === 0) return null; // no branch scope → don't filter
    const out = new Set<string>();
    for (const m of branchMems as any[]) {
      if (roleBranchIds.has(m.branch_id)) out.add(m.user_id);
    }
    return out;
  }, [branchMems, roleBranchIds]);

  const groupIds = rows.map((r) => r.id);
  const ownMembers = members.filter((m) => groupIds.includes(m.group_id));
  const memberUserIds = new Set(ownMembers.map((m) => m.user_id));

  const handleAdd = async (userId: string) => {
    if (!rows.length) return;
    setAdding(true);
    // Add to every branch-clone so the user gets access wherever the role exists.
    const rowsForUser = rows.filter(
      (r) => !ownMembers.some((m) => m.user_id === userId && m.group_id === r.id),
    );
    if (rowsForUser.length) {
      const { error } = await supabase
        .from("access_group_members")
        .insert(rowsForUser.map((r) => ({ group_id: r.id, user_id: userId })));
      if (error) {
        toast({ title: "Add failed", description: error.message, variant: "destructive" });
        setAdding(false);
        return;
      }
    }
    setPicker(false);
    setAdding(false);
    onChanged();
    toast({ title: "Member added" });
  };

  const handleRemove = async (userId: string) => {
    const ids = ownMembers.filter((m) => m.user_id === userId).map((m) => m.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from("access_group_members")
      .delete()
      .in("id", ids);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
    toast({ title: "Member removed" });
  };

  return (
    <Sheet open={!!roleName} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 pb-3 border-b">
          <SheetTitle>Members · {roleName}</SheetTitle>
          <SheetDescription>
            People assigned this role inherit its permissions immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="p-6 space-y-3 flex-1 overflow-auto">
          <Popover open={picker} onOpenChange={setPicker}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span>Add member</span>
                <ChevronsUpDown className="w-4 h-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search users…" />
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    {candidates
                      .filter((c: any) => !memberUserIds.has(c.id))
                      .filter((c: any) => staffUserIds.has(c.id))
                      .filter((c: any) =>
                        branchScopedUserIds ? branchScopedUserIds.has(c.id) : true,
                      )
                      .slice(0, 50)
                      .map((c: any) => (
                        <CommandItem
                          key={c.id}
                          onSelect={() => handleAdd(c.id)}
                          disabled={adding}
                        >
                          {c.first_name} {c.last_name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.email}
                          </span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="space-y-1">
            {[...memberUserIds].length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No members yet.
              </div>
            ) : (
              candidates
                .filter((c: any) => memberUserIds.has(c.id))
                .map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.first_name} {c.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.email}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemove(c.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Create new role
 * ──────────────────────────────────────────────────────────────────────── */

function CreateRoleDialog({
  open,
  branches,
  defaultBranchId,
  onClose,
  onCreated,
}: {
  open: boolean;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>(
    defaultBranchId ? [defaultBranchId] : [],
  );
  const [saving, setSaving] = useState(false);

  useMemoOnChange(open, () => {
    if (open) {
      setName("");
      setDescription("");
      setBranchIds(defaultBranchId ? [defaultBranchId] : []);
    }
  });

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!branchIds.length) {
      toast({ title: "Pick at least one branch", variant: "destructive" });
      return;
    }
    setSaving(true);
    const rows = branchIds.map((bid) => ({
      name: name.trim(),
      description: description.trim() || null,
      branch_id: bid,
      allowed_routes: ["/dashboard", "/settings", "/notifications"],
      managed_routes: [],
    }));
    const { error } = await supabase.from("access_groups").insert(rows as any);
    setSaving(false);
    if (error) {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Role created", description: "Open the role to configure permissions." });
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            Create a permission template. Toggle modules afterwards in the matrix.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Role name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marketing"
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Branches</Label>
            <div className="border rounded-md p-2 max-h-44 overflow-auto space-y-1">
              {branches.map((b) => {
                const checked = branchIds.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setBranchIds((prev) =>
                          e.target.checked
                            ? [...prev, b.id]
                            : prev.filter((id) => id !== b.id),
                        )
                      }
                    />
                    {b.name}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Seed starter roles
 * ──────────────────────────────────────────────────────────────────────── */

function SeedRolesDialog({
  open,
  branches,
  defaultBranchId,
  onClose,
  onSeeded,
}: {
  open: boolean;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
  onClose: () => void;
  onSeeded: () => void;
}) {
  const [branchIds, setBranchIds] = useState<string[]>(
    defaultBranchId ? [defaultBranchId] : [],
  );
  const [seeding, setSeeding] = useState(false);

  useMemoOnChange(open, () => {
    if (open) setBranchIds(defaultBranchId ? [defaultBranchId] : branches.map((b) => b.id));
  });

  const handleSeed = async () => {
    if (!branchIds.length) {
      toast({ title: "Pick at least one branch", variant: "destructive" });
      return;
    }
    setSeeding(true);
    const rows = branchIds.flatMap((bid) =>
      STARTER_ROLE_PRESETS.map((p) => ({
        name: p.name,
        description: p.description,
        branch_id: bid,
        allowed_routes: p.allowedRoutes,
        managed_routes: p.managedRoutes,
      })),
    );
    const { error } = await supabase.from("access_groups").insert(rows as any);
    setSeeding(false);
    if (error) {
      toast({ title: "Seed failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Starter roles created",
      description: `${STARTER_ROLE_PRESETS.length} roles × ${branchIds.length} branch${branchIds.length === 1 ? "" : "es"}.`,
    });
    onSeeded();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seed starter roles</DialogTitle>
          <DialogDescription>
            Adds {STARTER_ROLE_PRESETS.map((p) => p.name).join(", ")} as ready-to-use
            roles. You can tweak or delete any of them afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Apply to branches</Label>
          <div className="border rounded-md p-2 max-h-48 overflow-auto space-y-1">
            {branches.map((b) => {
              const checked = branchIds.includes(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setBranchIds((prev) =>
                        e.target.checked
                          ? [...prev, b.id]
                          : prev.filter((id) => id !== b.id),
                      )
                    }
                  />
                  {b.name}
                </label>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSeed} disabled={seeding}>
            {seeding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Seed roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}