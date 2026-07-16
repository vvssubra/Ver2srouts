import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Users, Star, Cake } from "lucide-react";
import type { FamilyMember } from "@/components/family/FamilyMemberRow";
import { icToDob, formatDob } from "@/lib/malaysian-ic";

type EmergencyContact = { name?: string; phone?: string; relation?: string; primary?: boolean };

interface Props {
  family: FamilyMember[];
  form: any;
  emergencyContacts: EmergencyContact[];
}

/**
 * Teacher-facing read-only family view.
 * Optimised for tap-to-call / tap-to-WhatsApp — no edit affordances,
 * no admin chips (no "Record only", no "Invite parent").
 */
export default function TeacherFamilyView({ family, form, emergencyContacts }: Props) {
  // Build a unified read-only roster: linked parent accounts + details-only parents
  const linkedRelations = new Set(
    family.map((m) => (m.relation || "").toLowerCase()),
  );
  const detailsOnly = (["father", "mother"] as const).filter((side) => {
    if (linkedRelations.has(side)) return false;
    const name = (form?.[`${side}_name`] ?? "").trim();
    const phone = (form?.[`${side}_phone`] ?? "").trim();
    return Boolean(name || phone);
  });

  const total = family.length + detailsOnly.length;
  const cleanedEmergency = emergencyContacts.filter((c) => c.name || c.phone);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Family
            <Badge variant="secondary" className="text-[10px]">{total}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Tap a number to call or message — quickest way to reach a parent.</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {total === 0 && (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
              No family contacts on file yet.
            </p>
          )}
          {family.map((m) => (
            <ContactCard
              key={m.link_id}
              name={`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Parent"}
              relation={m.relation}
              isPrimary={!!m.is_primary}
              phone={m.phone ?? null}
              email={m.email ?? null}
            />
          ))}
          {detailsOnly.map((side) => {
            const name = (form?.[`${side}_name`] ?? "").trim();
            const phone = (form?.[`${side}_phone`] ?? "").trim();
            const email = (form?.[`${side}_email`] ?? "").trim();
            const ic = (form?.[`${side}_ic`] ?? "").trim();
            const dob = formatDob(icToDob(ic));
            return (
              <ContactCard
                key={side}
                name={name || (side === "father" ? "Father" : "Mother")}
                relation={side}
                phone={phone || null}
                email={email || null}
                dob={dob}
              />
            );
          })}
        </CardContent>
      </Card>

      {cleanedEmergency.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="h-4 w-4 text-destructive" /> Emergency Contacts
            </CardTitle>
            <p className="text-xs text-muted-foreground">Backup contacts when no parent is reachable.</p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {cleanedEmergency.map((c, i) => (
              <ContactCard
                key={i}
                name={c.name || "Emergency contact"}
                relation={c.relation}
                phone={c.phone ?? null}
                isPrimary={!!c.primary}
                emergency
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContactCard({
  name, relation, phone, email, dob, isPrimary, emergency,
}: {
  name: string;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
  isPrimary?: boolean;
  emergency?: boolean;
}) {
  const initial = name?.[0]?.toUpperCase() ?? "?";
  const cleanPhone = (phone ?? "").replace(/[^0-9+]/g, "");
  const waLink = cleanPhone
    ? `https://wa.me/${cleanPhone.replace(/^\+?/, "").replace(/^0/, "60")}`
    : null;

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
          emergency ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        }`}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-sm sm:text-base truncate">{name}</p>
            {isPrimary && (
              <Badge className="text-[10px] gap-0.5 py-0">
                <Star className="h-2.5 w-2.5 fill-current" /> Primary
              </Badge>
            )}
            {relation && (
              <Badge variant="outline" className="capitalize text-[10px] py-0">{relation}</Badge>
            )}
            {dob && (
              <Badge variant="outline" className="text-[10px] py-0 gap-1">
                <Cake className="h-2.5 w-2.5" /> {dob}
              </Badge>
            )}
          </div>
          {email && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
          )}
          {phone && (
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{phone}</p>
          )}
        </div>
      </div>
      {phone && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild size="sm" variant="outline" className="h-10">
            <a href={`tel:${cleanPhone}`}>
              <Phone className="h-4 w-4 mr-1.5" /> Call
            </a>
          </Button>
          {waLink && (
            <Button asChild size="sm" className="h-10 bg-[#25D366] hover:bg-[#1FAD55] text-white">
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}