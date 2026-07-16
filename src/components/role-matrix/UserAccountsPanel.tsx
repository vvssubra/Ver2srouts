import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Copy, Loader2, ShieldAlert, Users } from "lucide-react";

type UserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  roles: string[];
};

type Bucket = "parents" | "teachers" | "administrators";

const BUCKET_META: Record<Bucket, { label: string; description: string }> = {
  parents: {
    label: "Parents",
    description: "Guardians with a parent account.",
  },
  teachers: {
    label: "Teachers",
    description: "Teaching staff who log in to Sprouts.",
  },
  administrators: {
    label: "Administrators",
    description:
      "HR, Operators, Finance, School Administrators, Superadmins and any other non-parent / non-teacher accounts.",
  },
};

function bucketFor(roles: string[]): Bucket {
  if (roles.includes("teacher")) return "teachers";
  const adminish = ["super_admin", "franchisee", "admin", "staff"];
  if (roles.some((r) => adminish.includes(r))) return "administrators";
  return "parents";
}

function displayName(u: UserRow): string {
  const n = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return n || u.email || "(no name)";
}

function roleBadgeLabel(r: string): string {
  switch (r) {
    case "super_admin":
      return "Superadmin";
    case "franchisee":
      return "Franchisee";
    case "admin":
      return "Administrator";
    case "staff":
      return "Staff";
    case "teacher":
      return "Teacher";
    case "parent":
      return "Parent";
    default:
      return r;
  }
}

export default function UserAccountsPanel() {
  const { role: myRole } = useAuth();
  const isSuperAdmin = myRole === "super_admin";
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<UserRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ user: UserRow; password: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-accounts-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: string }[];
    },
  });

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["user-accounts-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .order("first_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }[];
    },
  });

  const users: UserRow[] = useMemo(() => {
    const byUser = new Map<string, string[]>();
    for (const r of userRoles) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    }
    return profiles.map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
  }, [profiles, userRoles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const buckets: Record<Bucket, UserRow[]> = useMemo(() => {
    const out: Record<Bucket, UserRow[]> = {
      parents: [],
      teachers: [],
      administrators: [],
    };
    for (const u of filtered) out[bucketFor(u.roles)].push(u);
    for (const k of Object.keys(out) as Bucket[]) {
      out[k].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    }
    return out;
  }, [filtered]);

  const handleGenerate = async () => {
    if (!target) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-generate-temp-password", {
        body: { target_user_id: target.id },
      });
      if (error) throw error;
      if (!data?.temp_password) throw new Error("No password returned.");
      setResult({ user: target, password: data.temp_password });
      setConfirmOpen(false);
      setTarget(null);
    } catch (e: any) {
      toast({
        title: "Could not generate password",
        description: e.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyPassword = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.password);
      toast({ title: "Password copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Copy the password manually.", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> User accounts
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Accounts grouped by type. {isSuperAdmin
                ? "Superadmins can generate a temporary password for any user who has forgotten theirs."
                : "Only Superadmins can generate temporary passwords."}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading users…
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={[]}
            className="w-full"
          >
            {(Object.keys(BUCKET_META) as Bucket[]).map((key) => {
              const meta = BUCKET_META[key];
              const rows = buckets[key];
              return (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.label}</span>
                      <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-xs text-muted-foreground mb-3">{meta.description}</p>
                    {rows.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                        No accounts in this group.
                      </div>
                    ) : (
                      <div className="divide-y border rounded-md">
                        {rows.map((u) => (
                          <div
                            key={u.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                {displayName(u)}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {u.email || "—"}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {u.roles.length === 0 ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    No role
                                  </Badge>
                                ) : (
                                  u.roles.map((r) => (
                                    <Badge key={r} variant="outline" className="text-[10px]">
                                      {roleBadgeLabel(r)}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </div>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setTarget(u);
                                  setConfirmOpen(true);
                                }}
                              >
                                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                                Generate temp password
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" /> Generate temporary password?
            </DialogTitle>
            <DialogDescription>
              Generate a temporary password for the account{" "}
              <span className="font-medium text-foreground">{target ? displayName(target) : ""}</span>?
              <br /><br />
              This will invalidate the user's current password and require them to create a new
              password upon their next login.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setTarget(null); }} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result dialog */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password ready</DialogTitle>
            <DialogDescription>
              Copy this password and share it with{" "}
              <span className="font-medium text-foreground">{result ? displayName(result.user) : ""}</span>{" "}
              through a secure channel. This is the only time it will be shown.
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={result.password} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={copyPassword} aria-label="Copy password">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Email:</span> {result.user.email || "—"}</p>
                <p>The user will be required to change this password on their next login.</p>
                <p>This action was recorded in the audit log.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}