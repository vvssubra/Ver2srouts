import { useState } from "react";
import { icToDob, formatDob } from "@/lib/malaysian-ic";
import type { AddParentPrefill } from "@/components/AddParentDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Users, Send, Star, Phone, Plus, Trash2, ShieldAlert, UserCircle2, Check, X, Clock,
  ChevronDown, ChevronRight, Briefcase, IdCard, Mail, PhoneCall, Cake,
} from "lucide-react";
import FamilyMemberRow, { type FamilyMember } from "@/components/family/FamilyMemberRow";

type EmergencyContact = { name: string; phone: string; relation: string };
type ParentSide = "father" | "mother";

interface Props {
  studentId: string;
  branchId: string;
  form: any;
  updateField: (k: string, v: any) => void;
  family: FamilyMember[] | undefined;
  pendingParents: any[];
  onAddParent: (prefill?: AddParentPrefill) => void;
  onApprovePending: (linkId: string) => void;
  onRejectPending: (linkId: string) => void;
  extraContacts: EmergencyContact[];
  onExtraContactsChange: (next: EmergencyContact[]) => void;
}

export default function StudentFamilyTab({
  studentId, branchId, form, updateField, family, pendingParents,
  onAddParent, onApprovePending, onRejectPending,
  extraContacts, onExtraContactsChange,
}: Props) {
  const hasPrimary = !!(family ?? []).some((m) => m.is_primary);

  const addExtra = () =>
    onExtraContactsChange([...(extraContacts ?? []), { name: "", phone: "", relation: "" }]);
  const updateExtra = (i: number, key: keyof EmergencyContact, val: string) => {
    const next = [...(extraContacts ?? [])];
    next[i] = { ...next[i], [key]: val };
    onExtraContactsChange(next);
  };
  const removeExtra = (i: number) => {
    const next = [...(extraContacts ?? [])];
    next.splice(i, 1);
    onExtraContactsChange(next);
  };

  // Build a unified roster: linked parent accounts first, then any
  // "details-only" parents captured before invitations were sent.
  const linked = family ?? [];
  const linkedRelations = new Set(
    linked.map((m) => (m.relation || "").toLowerCase()),
  );

  // Sides the user explicitly revealed via "Add father / mother" even when
  // the form fields are still empty.
  const [revealed, setRevealed] = useState<Set<ParentSide>>(new Set());

  const detailsOnly: ParentSide[] = (["father", "mother"] as ParentSide[]).filter((side) => {
    if (linkedRelations.has(side)) return false; // already shown as an account card
    if (revealed.has(side)) return true;
    const name = (form?.[`${side}_name`] ?? "").trim();
    const phone = (form?.[`${side}_phone`] ?? "").trim();
    const ic = (form?.[`${side}_ic`] ?? "").trim();
    const occ = (form?.[`${side}_occupation`] ?? "").trim();
    const email = (form?.[`${side}_email`] ?? "").trim();
    return Boolean(name || phone || ic || occ || email);
  });

  const totalPeople = linked.length + detailsOnly.length;

  return (
    <div className="space-y-4">
      {/* Unified Contacts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Family
              <Badge variant="secondary" className="text-[10px]">{totalPeople}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              One card per parent or guardian. Inviting a parent gives them portal access; everyone else stays here for staff records. Mark one as <span className="font-medium">Primary</span> so staff know who to call first.
            </p>
          </div>
          <Button size="sm" onClick={() => onAddParent()}>
            <Send className="h-3.5 w-3.5 mr-1" /> Invite parent
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasPrimary && linked.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No primary contact set. Toggle one parent as primary below — that's the first person staff call.</span>
            </div>
          )}

          {totalPeople === 0 ? (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
              No family members on file yet.<br />
              Click <strong>Invite parent</strong> to add the first parent — they'll get portal access and a welcome email.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Linked parent accounts (with full FamilyMemberRow controls) */}
              {linked.map((m) => (
                <FamilyMemberRow key={m.link_id} member={m} studentId={studentId} branchId={branchId} />
              ))}

              {/* Details-only parents (no portal account yet) — collapsible, fully editable */}
              {detailsOnly.map((side) => (
                <ParentDetailsCard
                  key={side}
                  side={side}
                  form={form}
                  updateField={updateField}
                  onInvite={() =>
                    onAddParent({
                      relation: side,
                      first_name: (form?.[`${side}_name`] ?? "").split(" ")[0] ?? "",
                      last_name: (form?.[`${side}_name`] ?? "").split(" ").slice(1).join(" ") ?? "",
                      email: form?.[`${side}_email`] ?? "",
                      phone: form?.[`${side}_phone`] ?? "",
                      ic_number: form?.[`${side}_ic`] ?? "",
                      occupation: form?.[`${side}_occupation`] ?? "",
                    })
                  }
                />
              ))}

              {/* Add father / mother record if missing */}
              {(detailsOnly.length + linked.length < 2) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["father", "mother"] as ParentSide[]).map((side) => {
                    const exists = linkedRelations.has(side) || detailsOnly.includes(side);
                    if (exists) return null;
                    return (
                      <Button
                        key={side}
                        size="sm"
                        variant="outline"
                        onClick={() => setRevealed((prev) => new Set(prev).add(side))}
                        className="text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add {side === "father" ? "father" : "mother"}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Pending requests */}
          {pendingParents.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Pending Requests ({pendingParents.length})
                </p>
                {pendingParents.map((pl: any) => (
                  <div key={pl.id} className="flex items-center justify-between rounded-lg p-2.5 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                    <div>
                      <p className="text-sm font-medium">{pl.profiles?.first_name} {pl.profiles?.last_name}</p>
                      <p className="text-xs text-muted-foreground">{pl.profiles?.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" onClick={() => onApprovePending(pl.id)}><Check className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => onRejectPending(pl.id)}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-destructive" /> Emergency Contacts
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Non-family backups (e.g. grandparent, uncle, neighbour) called when no parent is reachable. List in the order they should be tried.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Primary (existing single emergency contact) */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
              <span className="text-xs text-muted-foreground">First non-parent contact to try.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label className="text-xs">Name</Label><Input value={form.emergency_contact_name ?? ""} onChange={(e) => updateField("emergency_contact_name", e.target.value)} /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.emergency_contact_phone ?? ""} onChange={(e) => updateField("emergency_contact_phone", e.target.value)} /></div>
              <div><Label className="text-xs">Relation</Label><Input value={form.emergency_contact_relation ?? ""} onChange={(e) => updateField("emergency_contact_relation", e.target.value)} placeholder="e.g. Grandmother" /></div>
            </div>
          </div>

          {/* Secondary contacts (variable list) */}
          {(extraContacts ?? []).map((c, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="gap-1">Secondary #{i + 1}</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeExtra(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label className="text-xs">Name</Label><Input value={c.name} onChange={(e) => updateExtra(i, "name", e.target.value)} /></div>
                <div><Label className="text-xs">Phone</Label><Input value={c.phone} onChange={(e) => updateExtra(i, "phone", e.target.value)} /></div>
                <div><Label className="text-xs">Relation</Label><Input value={c.relation} onChange={(e) => updateExtra(i, "relation", e.target.value)} placeholder="e.g. Uncle" /></div>
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addExtra}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add secondary contact
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** A unified card for parents who aren't yet portal users — collapsed by default. */
function ParentDetailsCard({
  side, form, updateField, onInvite,
}: {
  side: ParentSide;
  form: any;
  updateField: (k: string, v: any) => void;
  onInvite: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = side === "father" ? "Father / Bapa" : "Mother / Ibu";
  const name = (form?.[`${side}_name`] ?? "").trim();
  const phone = (form?.[`${side}_phone`] ?? "").trim();
  const email = (form?.[`${side}_email`] ?? "").trim();
  const ic = (form?.[`${side}_ic`] ?? "").trim();
  const dob = formatDob(icToDob(ic));
  const initial = name ? name[0]!.toUpperCase() : (side === "father" ? "F" : "M");

  const remove = () => {
    if (!confirm(`Remove ${title} details?`)) return;
    updateField(`${side}_name`, "");
    updateField(`${side}_ic`, "");
    updateField(`${side}_phone`, "");
    updateField(`${side}_occupation`, "");
    updateField(`${side}_email`, "");
  };

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition rounded-lg"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground text-sm font-medium shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{name || `Add ${title.toLowerCase()}`}</p>
            <Badge variant="outline" className="capitalize text-[10px] py-0">{side}</Badge>
            <Badge variant="secondary" className="text-[10px] py-0">Record only</Badge>
            {dob && (
              <Badge variant="outline" className="text-[10px] py-0 gap-1">
                <Cake className="h-2.5 w-2.5" /> {dob}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {[email, phone].filter(Boolean).join(" · ") ||
              "No portal access — tap to edit details or invite to portal."}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs flex items-center gap-1"><UserCircle2 className="h-3 w-3" /> Name</Label>
              <Input value={form?.[`${side}_name`] ?? ""} onChange={(e) => updateField(`${side}_name`, e.target.value)} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><IdCard className="h-3 w-3" /> IC No.</Label>
              <Input value={form?.[`${side}_ic`] ?? ""} onChange={(e) => updateField(`${side}_ic`, e.target.value)} />
              {dob && (
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Cake className="h-2.5 w-2.5" /> DOB: {dob}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><PhoneCall className="h-3 w-3" /> Phone</Label>
              <Input value={form?.[`${side}_phone`] ?? ""} onChange={(e) => updateField(`${side}_phone`, e.target.value)} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Briefcase className="h-3 w-3" /> Occupation</Label>
              <Input value={form?.[`${side}_occupation`] ?? ""} onChange={(e) => updateField(`${side}_occupation`, e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
              <Input
                type="email"
                value={form?.[`${side}_email`] ?? ""}
                onChange={(e) => updateField(`${side}_email`, e.target.value)}
                placeholder="parent@email.com"
              />
            </div>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onInvite}>
              <Mail className="h-3.5 w-3.5 mr-1" /> Invite to parent portal
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Don't forget to press <strong>Save</strong> at the top of the profile to keep these changes.
          </p>
        </div>
      )}
    </div>
  );
}