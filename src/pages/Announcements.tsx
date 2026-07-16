import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Megaphone, Plus, Send, Loader2, Eye, EyeOff, Users, Trash2, Mail, Search, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

const DEFAULT_CLASS_OPTIONS = ["3 Tahun", "4 Tahun", "5 Tahun", "6 Tahun"];

export default function Announcements() {
  const { user, role } = useAuth();
  const { activeBranchIds, selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  // Announcement module is INTERNAL STAFF only. The legacy ?audience query
  // param is ignored — every announcement created/viewed here targets staff.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Target audience types:
  //  - staff_all        : every staff member in the branch
  //  - staff_specific   : hand-picked staff (optionally filtered by class)
  //  - parents_all      : every parent in the branch
  //  - parents_class    : parents of children in a specific class
  //  - parents_specific : hand-picked parents
  const [targetType, setTargetType] = useState<
    "staff_all" | "staff_specific" | "parents_all" | "parents_class" | "parents_specific"
  >("staff_all");
  const [targetClass, setTargetClass] = useState("");
  const [staffClassFilter, setStaffClassFilter] = useState<string>("__all__");
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [sendAsEmail, setSendAsEmail] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");

  // Get user's branch
  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // HR detection: only super_admin/franchisee OR members of an access group
  // whose name contains "HR" can create/edit/delete announcements.
  const { data: isHR } = useQuery({
    queryKey: ["is-hr-access-group", user?.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("access_group_members")
        .select("group_id")
        .eq("user_id", user!.id);
      const groupIds = (members ?? []).map((m: any) => m.group_id);
      if (!groupIds.length) return false;
      const { data: groups } = await supabase
        .from("access_groups")
        .select("name")
        .in("id", groupIds);
      return (groups ?? []).some((g: any) => /hr/i.test(g?.name ?? ""));
    },
    enabled: !!user,
  });
  const canEdit = role === "super_admin" || role === "franchisee" || !!isHR;

  // Use the globally selected branch when set; otherwise fall back to the
  // user's own primary branch. Super admins can pick any branch (or "all").
  const branchId =
    selectedBranchId && selectedBranchId !== "all"
      ? selectedBranchId
      : membership?.branch_id;
  const listBranchIds =
    role === "super_admin" && (!selectedBranchId || selectedBranchId === "all")
      ? activeBranchIds
      : branchId
      ? [branchId]
      : [];

  // Get announcements
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements", listBranchIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .in("branch_id", listBranchIds)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: listBranchIds.length > 0,
  });

  // Get all parents in branch
  const { data: branchParents } = useQuery({
    queryKey: ["branch-parents", branchId],
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("branch_id", branchId!);
      const studentIds = students?.map((s: any) => s.id) ?? [];
      if (!studentIds.length) return [];

      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentIds);
      const parentIds = [...new Set(links?.map((l: any) => l.parent_id) ?? [])];
      if (!parentIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", parentIds);
      return profiles ?? [];
    },
    enabled: !!branchId,
  });

  // Parents grouped by their child's class, with the linked student names.
  // Powers the "Specific Parents" picker so admins can find recipients by
  // class or by searching for a child's name (which they usually remember
  // better than the parent's name).
  const { data: parentsByClass } = useQuery({
    queryKey: ["parents-by-class", branchId],
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("id, first_name, last_name, class_name")
        .eq("branch_id", branchId!);
      const studentIds = (students ?? []).map((s: any) => s.id);
      if (!studentIds.length) return [] as Array<{ className: string; parents: any[] }>;

      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id, student_id")
        .in("student_id", studentIds);
      const parentIds = [...new Set((links ?? []).map((l: any) => l.parent_id))];
      if (!parentIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", parentIds);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const studentMap = new Map((students ?? []).map((s: any) => [s.id, s]));

      const groups = new Map<string, Map<string, { parent: any; students: any[] }>>();
      for (const link of links ?? []) {
        const stu: any = studentMap.get(link.student_id);
        const parent: any = profileMap.get(link.parent_id);
        if (!stu || !parent) continue;
        const cls = stu.class_name || "Unassigned";
        if (!groups.has(cls)) groups.set(cls, new Map());
        const g = groups.get(cls)!;
        if (!g.has(parent.id)) g.set(parent.id, { parent, students: [] });
        g.get(parent.id)!.students.push(stu);
      }
      return Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([className, m]) => ({
          className,
          parents: Array.from(m.values()).sort((a, b) =>
            `${a.parent.first_name ?? ""} ${a.parent.last_name ?? ""}`.localeCompare(
              `${b.parent.first_name ?? ""} ${b.parent.last_name ?? ""}`
            )
          ),
        }));
    },
    enabled: !!branchId,
  });

  // Map of class name → class id for the current branch (used to filter staff
  // by their `assigned_class_ids`).
  const { data: branchClasses } = useQuery({
    queryKey: ["branch-classes", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("id, class_name")
        .eq("branch_id", branchId!);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Get all staff in branch (with class assignments so we can filter picker)
  const { data: branchStaff } = useQuery({
    queryKey: ["branch-staff", branchId],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("branch_memberships")
        .select("user_id, assigned_class_ids")
        .eq("branch_id", branchId!);
      const userIds = memberships?.map((m: any) => m.user_id) ?? [];
      const assignedByUser = new Map<string, string[]>(
        (memberships ?? []).map((m: any) => [
          m.user_id,
          Array.isArray(m.assigned_class_ids) ? m.assigned_class_ids : [],
        ])
      );
      if (!userIds.length) return [];

      // Get profiles for these users, excluding parents (staff/franchisee only)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);

      // Filter to only staff roles (exclude parents)
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .in("role", ["super_admin", "franchisee", "teacher"]);

      const staffUserIds = new Set(roles?.map((r: any) => r.user_id) ?? []);
      return (profiles ?? [])
        .filter((p: any) => staffUserIds.has(p.id))
        .map((p: any) => ({
          ...p,
          assigned_class_ids: assignedByUser.get(p.id) ?? [],
        }));
    },
    enabled: !!branchId,
  });

  // Get branch settings for custom class names
  const { data: branchSettingsData } = useQuery({
    queryKey: ["branch-settings", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("*").eq("branch_id", branchId!).maybeSingle();
      return data;
    },
    enabled: !!branchId,
  });

  // Class list: use the `classes` table as the single source of truth for the
  // branch (matches what Settings > Classes shows). Fall back to distinct
  // student class_names only if no classes are registered yet — never mix in
  // stale `branch_settings.class_names`, which may hold legacy short codes.
  const { data: classNames } = useQuery({
    queryKey: ["branch-class-names", branchId],
    queryFn: async () => {
      const { data: classesRows } = await supabase
        .from("classes")
        .select("class_name")
        .eq("branch_id", branchId!);
      let names = Array.from(
        new Set((classesRows ?? []).map((c: any) => c.class_name).filter(Boolean))
      );
      if (names.length === 0) {
        const { data: studentRows } = await supabase
          .from("students")
          .select("class_name")
          .eq("branch_id", branchId!)
          .not("class_name", "is", null);
        names = Array.from(
          new Set((studentRows ?? []).map((s: any) => s.class_name).filter(Boolean))
        );
      }
      names.sort((a, b) => a.localeCompare(b));
      return names.length > 0 ? names : DEFAULT_CLASS_OPTIONS;
    },
    enabled: !!branchId,
  });

  // Get reads for selected announcement
  const { data: reads } = useQuery({
    queryKey: ["announcement-reads", selectedAnnouncement],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcement_reads")
        .select("*")
        .eq("announcement_id", selectedAnnouncement!);
      return data ?? [];
    },
    enabled: !!selectedAnnouncement,
  });

  const readParentIds = new Set(reads?.map((r: any) => r.parent_user_id) ?? []);

  // Reset the read/unread filter whenever the user opens a different announcement.
  const handleSelectAnnouncement = (id: string | null) => {
    setSelectedAnnouncement(id);
    setReadFilter("all");
  };

  // Create announcement
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim() || !branchId) return;
      const insertData: any = {
        branch_id: branchId,
        title: title.trim(),
        body: body.trim(),
        created_by: user!.id,
        target_type: targetType,
      };
      if (targetType === "parents_class" && targetClass) {
        insertData.target_class = targetClass;
      }
      if (targetType === "parents_specific" && selectedParentIds.length > 0) {
        insertData.target_parent_ids = selectedParentIds;
      }
      if (targetType === "staff_specific" && selectedStaffIds.length > 0) {
        // Reuse target_parent_ids column for staff ids to avoid schema changes.
        insertData.target_parent_ids = selectedStaffIds;
      }
      const { error } = await supabase.from("announcements").insert(insertData);
      if (error) throw error;
    },
    onSuccess: async () => {
      try {
        // Parent fan-out (in-app notification + banner push) is handled by the
        // `notify_announcement_broadcast` DB trigger, which runs with SECURITY
        // DEFINER so it bypasses the notifications-table RLS that would
        // otherwise silently drop inserts for parents outside the announcer's
        // branch_memberships. For staff audiences we still insert here since
        // the trigger only fans out to parents.
        let recipientIds: string[] = [];
        const isStaffAudience =
          targetType === "staff_all" || targetType === "staff_specific";
        if (targetType === "staff_all") {
          recipientIds = branchStaff?.map((s: any) => s.id) ?? [];
        } else if (targetType === "staff_specific") {
          recipientIds = selectedStaffIds;
        }

        if (isStaffAudience && recipientIds.length > 0) {
          let announcementId: string | null = null;
          try {
            const { data: latest } = await supabase
              .from("announcements")
              .select("id")
              .eq("created_by", user!.id)
              .eq("title", title.trim())
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            announcementId = (latest as any)?.id ?? null;
          } catch {
            // best-effort
          }
          const notifType = "announcement";
          const actionUrl = "/announcements";
          const groupKey = announcementId
            ? `${notifType}:${announcementId}`
            : `${notifType}:${title.trim().slice(0, 40)}`;
          const notifications = recipientIds.map((pid) => ({
            user_id: pid,
            title: "📢 " + title.trim(),
            message: body.trim().slice(0, 200),
            type: notifType,
            action_url: actionUrl,
            reference_id: announcementId,
            group_key: groupKey,
          }));
          await supabase.from("notifications").insert(notifications);
        }

        // Emails (opt-in) — still fan out from the client for both audiences.
        if (sendAsEmail) {
          {
            // Collect emails from both parents and staff depending on target
            let emailIds: string[] = recipientIds;
            if (!isStaffAudience) {
              if (targetType === "parents_all") {
                emailIds = branchParents?.map((p: any) => p.id) ?? [];
              } else if (targetType === "parents_specific") {
                emailIds = selectedParentIds;
              } else if (targetType === "parents_class" && targetClass && branchId) {
                const { data: classStudents } = await supabase
                  .from("students")
                  .select("id")
                  .eq("branch_id", branchId)
                  .eq("class_name", targetClass);
                const csIds = classStudents?.map((s: any) => s.id) ?? [];
                if (csIds.length > 0) {
                  const { data: classLinks } = await supabase
                    .from("parent_students")
                    .select("parent_id")
                    .in("student_id", csIds);
                  emailIds = [...new Set(classLinks?.map((l: any) => l.parent_id) ?? [])];
                }
              }
            }
            const allRecipients = [
              ...(branchParents ?? []),
              ...(branchStaff ?? []),
            ];
            const recipientEmails = allRecipients
              .filter((p: any) => emailIds.includes(p.id) && p.email)
              .map((p: any) => p.email);
            // Deduplicate
            const uniqueEmails = [...new Set(recipientEmails)];

            if (uniqueEmails.length > 0) {
              const emailType = "announcement";
              await supabase.functions.invoke("send-email", {
                body: {
                  type: emailType,
                  to: uniqueEmails,
                  branchId,
                  data: {
                    title: title.trim(),
                    body: body.trim(),
                    authorName: user ? `${(user as any).user_metadata?.first_name || ""} ${(user as any).user_metadata?.last_name || ""}`.trim() || "Admin" : "Admin",
                  },
                },
              });
              toast({ title: `Announcement emailed to ${uniqueEmails.length} recipient(s)` });
            }
          }
        }
      } catch (e) {
        console.error("Failed to create notifications:", e);
      }

      setDialogOpen(false);
      setTitle("");
      setBody("");
      setTargetClass("");
      setSelectedParentIds([]);
      setSendAsEmail(false);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement published" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete announcement
  const deleteMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      // Delete reads first, then announcement
      await supabase.from("announcement_reads").delete().eq("announcement_id", announcementId);
      const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedAnnouncement(null);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedData = announcements?.find((a: any) => a.id === selectedAnnouncement);

  // Resolve the actual recipients for the selected announcement based on its
  // target_type. This is what "Read Tracking" should compare against — not
  // the branch staff list, which was wrong for parent-facing announcements.
  const { data: expectedRecipients } = useQuery({
    queryKey: [
      "announcement-expected-recipients",
      selectedAnnouncement,
      selectedData?.target_type,
      selectedData?.target_class,
      (selectedData?.target_parent_ids ?? []).join(","),
      selectedData?.branch_id,
    ],
    queryFn: async () => {
      if (!selectedData) return [] as any[];
      const t = selectedData.target_type;
      const bId = selectedData.branch_id;

      const fetchProfiles = async (ids: string[]) => {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length) return [];
        const { data } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", unique);
        return data ?? [];
      };

      // Staff audiences
      if (t === "staff" || t === "staff_all") {
        return branchStaff ?? [];
      }
      if (t === "staff_specific") {
        return fetchProfiles(selectedData.target_parent_ids ?? []);
      }

      // Parent audiences
      if (t === "parents_all" || t === "all") {
        return branchParents ?? [];
      }
      if (t === "parents_specific" || t === "specific") {
        return fetchProfiles(selectedData.target_parent_ids ?? []);
      }
      if ((t === "parents_class" || t === "class") && selectedData.target_class) {
        const { data: students } = await supabase
          .from("students")
          .select("id")
          .eq("branch_id", bId)
          .eq("class_name", selectedData.target_class);
        const studentIds = (students ?? []).map((s: any) => s.id);
        if (!studentIds.length) return [];
        const { data: links } = await supabase
          .from("parent_students")
          .select("parent_id")
          .in("student_id", studentIds);
        return fetchProfiles((links ?? []).map((l: any) => l.parent_id));
      }
      return [];
    },
    enabled: !!selectedData,
  });

  // Actual delivered recipients (from the notifications table). This is the
  // ground truth of who was notified in-app, and we union it with the
  // "expected" list so admins never see a mismatch between "who should have
  // received this" and "who did receive it" — e.g. legacy announcements
  // where target_type changed, or historic data drift.
  const { data: deliveredRecipients } = useQuery({
    queryKey: ["announcement-delivered-recipients", selectedAnnouncement],
    queryFn: async () => {
      if (!selectedAnnouncement) return [] as any[];
      const { data: notifs } = await supabase
        .from("notifications")
        .select("user_id")
        .eq("reference_id", selectedAnnouncement)
        .eq("type", "announcement");
      const ids = Array.from(new Set((notifs ?? []).map((n: any) => n.user_id).filter(Boolean)));
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      return profs ?? [];
    },
    enabled: !!selectedAnnouncement,
  });

  // Internal staff view: staff-targeted announcements only.
  // Super admins additionally see legacy parent-facing announcements so nothing is hidden from them.
  // Staff-facing announcement page: show anything targeted at staff.
  // Super admins see everything (including legacy parent-facing rows).
  const isStaffTarget = (t: any) =>
    t === "staff" || t === "staff_all" || t === "staff_specific";
  const filteredAnnouncements = (announcements ?? []).filter((a: any) =>
    role === "super_admin" ? true : isStaffTarget(a.target_type)
  );
  // Union expected (from target rules) + delivered (from notifications table)
  // so admins see anyone who actually received the announcement even if the
  // target list was later edited or fanned out via legacy rules.
  const recipients = (() => {
    const exp = (expectedRecipients ?? []) as any[];
    const delivered = (deliveredRecipients ?? []) as any[];
    const map = new Map<string, any>();
    for (const r of exp) if (r?.id) map.set(r.id, r);
    for (const r of delivered) if (r?.id && !map.has(r.id)) map.set(r.id, r);
    return Array.from(map.values());
  })();
  const totalRecipients = recipients.length;
  const readCount = recipients.filter((r) => readParentIds.has(r.id)).length;
  const notReadCount = Math.max(0, totalRecipients - readCount);

  // Enrich recipients with the child(ren) they are linked to and a group label
  // (class name for parents, "Staff" for staff audiences). Powers the grouped
  // read-tracking view so admins can identify parents by their child.
  const { data: enrichedRecipients } = useQuery({
    queryKey: [
      "announcement-recipient-context",
      selectedAnnouncement,
      selectedData?.branch_id,
      recipients.map((r: any) => r.id).sort().join(","),
    ],
    queryFn: async () => {
      if (!selectedData || recipients.length === 0) return [] as any[];
      const t = selectedData.target_type;
      const isStaff = t === "staff" || t === "staff_all" || t === "staff_specific";
      if (isStaff) {
        return recipients.map((r: any) => ({ ...r, groupLabel: "Staff", children: [] }));
      }
      const parentIds = recipients.map((r: any) => r.id);
      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id, students(id, first_name, last_name, class_name, branch_id)")
        .in("parent_id", parentIds);
      const byParent = new Map<string, any[]>();
      for (const l of (links ?? []) as any[]) {
        const stu = l.students;
        if (!stu) continue;
        if (selectedData.branch_id && stu.branch_id !== selectedData.branch_id) continue;
        if (!byParent.has(l.parent_id)) byParent.set(l.parent_id, []);
        byParent.get(l.parent_id)!.push(stu);
      }
      return recipients.map((r: any) => {
        const kids = byParent.get(r.id) ?? [];
        const classes = [...new Set(kids.map((k: any) => k.class_name).filter(Boolean))] as string[];
        const groupLabel = classes.length ? classes.sort().join(", ") : "Unassigned";
        return { ...r, groupLabel, children: kids };
      });
    },
    enabled: !!selectedData && recipients.length > 0,
  });

  // Reminder: create an in-app notification for the parent and (best-effort)
  // send them an email nudge. Uses the same "announcement" email template.
  const [remindingIds, setRemindingIds] = useState<string[]>([]);
  const sendReminder = async (recipient: any) => {
    if (!selectedData) return;
    setRemindingIds((p) => [...p, recipient.id]);
    try {
      await supabase.from("notifications").insert({
        user_id: recipient.id,
        title: "🔔 Reminder: " + selectedData.title,
        message: (selectedData.body ?? "").slice(0, 200),
        type: "announcement",
        action_url: "/parent-messages",
        reference_id: selectedData.id,
        group_key: `announcement-reminder:${selectedData.id}:${recipient.id}`,
      } as any);
      if (recipient.email) {
        try {
          await supabase.functions.invoke("send-email", {
            body: {
              type: "announcement",
              to: [recipient.email],
              branchId: selectedData.branch_id,
              data: {
                title: `Reminder: ${selectedData.title}`,
                body: selectedData.body,
                authorName: "School",
              },
            },
          });
        } catch {
          // email is best-effort; in-app notification already delivered
        }
      }
      toast({ title: `Reminder sent to ${recipient.first_name ?? "recipient"}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRemindingIds((p) => p.filter((id) => id !== recipient.id));
    }
  };
  const remindAllUnread = async (list: any[]) => {
    for (const r of list) {
      // eslint-disable-next-line no-await-in-loop
      await sendReminder(r);
    }
  };

  const toggleParentId = (id: string) => {
    setSelectedParentIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const getTargetLabel = (a: any) => {
    const t = a.target_type;
    if (t === "staff" || t === "staff_all") return "👩‍🏫 All Staff";
    if (t === "staff_specific") return `👩‍🏫 ${(a.target_parent_ids ?? []).length} staff`;
    if (t === "parents_all" || t === "all") return "👨‍👩‍👧 All Parents";
    if (t === "parents_class" || t === "class") return `Parents · ${a.target_class}`;
    if (t === "parents_specific" || t === "specific")
      return `👨‍👩‍👧 ${(a.target_parent_ids ?? []).length} parents`;
    return t ?? "—";
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-full overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              Announcements
            </h1>
          </div>
          {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" /> New Announcement</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea
                  placeholder="Write your announcement here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                />

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Target Audience</Label>
                  <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff_all">👩‍🏫 All Staff in this branch</SelectItem>
                      <SelectItem value="staff_specific">👩‍🏫 Specific Staff</SelectItem>
                      <SelectItem value="parents_all">👨‍👩‍👧 All Parents in this branch</SelectItem>
                      <SelectItem value="parents_class">👨‍👩‍👧 Parents by Class</SelectItem>
                      <SelectItem value="parents_specific">👨‍👩‍👧 Specific Parents</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetType === "parents_class" && (
                  <div className="space-y-2">
                    <Label className="text-sm">Select Class</Label>
                    <Select value={targetClass} onValueChange={setTargetClass}>
                      <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
                      <SelectContent>
                        {(classNames ?? DEFAULT_CLASS_OPTIONS).map((cn: string) => (
                          <SelectItem key={cn} value={cn}>{cn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {targetType === "parents_specific" && (() => {
                  const q = parentSearch.trim().toLowerCase();
                  const groups = (parentsByClass ?? []).map((g) => {
                    const parents = g.parents.filter(({ parent, students }: any) => {
                      if (!q) return true;
                      const parentName = `${parent.first_name ?? ""} ${parent.last_name ?? ""}`.toLowerCase();
                      const email = (parent.email ?? "").toLowerCase();
                      const kids = students
                        .map((s: any) => `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase())
                        .join(" ");
                      return (
                        parentName.includes(q) ||
                        email.includes(q) ||
                        kids.includes(q) ||
                        g.className.toLowerCase().includes(q)
                      );
                    });
                    return { ...g, parents };
                  }).filter((g) => g.parents.length > 0);

                  const toggleClass = (parents: any[], allSelected: boolean) => {
                    setSelectedParentIds((prev) => {
                      const ids = parents.map((p) => p.parent.id);
                      if (allSelected) return prev.filter((id) => !ids.includes(id));
                      return [...new Set([...prev, ...ids])];
                    });
                  };

                  const openValues = q
                    ? groups.map((g) => g.className)
                    : undefined;

                  return (
                    <div className="space-y-2">
                      <Label className="text-sm">
                        Select Parents ({selectedParentIds.length} selected)
                      </Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={parentSearch}
                          onChange={(e) => setParentSearch(e.target.value)}
                          placeholder="Search by child, parent, or class"
                          className="pl-7 h-8 text-sm"
                        />
                      </div>
                      <ScrollArea className="h-[240px] border rounded-md">
                        {groups.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-3">
                            No parents match.
                          </p>
                        ) : (
                          <Accordion
                            type="multiple"
                            {...(openValues ? { value: openValues } : {})}
                            className="px-1"
                          >
                            {groups.map((g) => {
                              const ids = g.parents.map((p: any) => p.parent.id);
                              const selectedInClass = ids.filter((id) =>
                                selectedParentIds.includes(id)
                              ).length;
                              const allSelected =
                                selectedInClass === ids.length && ids.length > 0;
                              return (
                                <AccordionItem key={g.className} value={g.className} className="border-b last:border-0">
                                  <AccordionTrigger className="text-sm py-2 hover:no-underline">
                                    <div className="flex items-center gap-2 flex-1 pr-2">
                                      <span className="font-medium">{g.className}</span>
                                      <Badge variant="secondary" className="text-[10px]">
                                        {selectedInClass}/{ids.length}
                                      </Badge>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleClass(g.parents, allSelected);
                                        }}
                                        className="ml-auto text-[10px] text-primary hover:underline"
                                      >
                                        {allSelected ? "Clear class" : "Select class"}
                                      </button>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="pb-2">
                                    {g.parents.map(({ parent, students }: any) => (
                                      <label
                                        key={parent.id}
                                        className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={selectedParentIds.includes(parent.id)}
                                          onCheckedChange={() => toggleParentId(parent.id)}
                                          className="mt-0.5"
                                        />
                                        <div className="min-w-0">
                                          <p className="text-sm truncate">
                                            {parent.first_name ?? ""} {parent.last_name ?? ""}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground truncate">
                                            Child: {students
                                              .map((s: any) =>
                                                `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim()
                                              )
                                              .filter(Boolean)
                                              .join(", ")}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground truncate">
                                            {parent.email}
                                          </p>
                                        </div>
                                      </label>
                                    ))}
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        )}
                      </ScrollArea>
                      <p className="text-[10px] text-muted-foreground">
                        Grouped by child's class. Search matches child name, parent name, email, or class.
                      </p>
                    </div>
                  );
                })()}

                {targetType === "staff_specific" && (() => {
                  const filterClassId =
                    staffClassFilter === "__all__"
                      ? null
                      : (branchClasses ?? []).find((c: any) => c.class_name === staffClassFilter)?.id ?? null;
                  const visibleStaff = (branchStaff ?? []).filter((s: any) => {
                    if (!filterClassId) return true;
                    return (s.assigned_class_ids ?? []).includes(filterClassId);
                  });
                  return (
                    <div className="space-y-2">
                      <Label className="text-sm">Filter by Class (optional)</Label>
                      <Select value={staffClassFilter} onValueChange={setStaffClassFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All classes</SelectItem>
                          {(classNames ?? DEFAULT_CLASS_OPTIONS).map((cn: string) => (
                            <SelectItem key={cn} value={cn}>{cn}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label className="text-sm">
                        Select Staff ({selectedStaffIds.length} selected)
                      </Label>
                      <ScrollArea className="h-[180px] border rounded-md p-2">
                        {visibleStaff.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2">No staff match this filter.</p>
                        ) : visibleStaff.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 py-1.5">
                            <Checkbox
                              checked={selectedStaffIds.includes(s.id)}
                              onCheckedChange={() =>
                                setSelectedStaffIds((prev) =>
                                  prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                                )
                              }
                            />
                            <div>
                              <p className="text-sm">{s.first_name ?? ""} {s.last_name ?? ""}</p>
                              <p className="text-[10px] text-muted-foreground">{s.email}</p>
                            </div>
                          </div>
                        ))}
                      </ScrollArea>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Send as Email</p>
                      <p className="text-[10px] text-muted-foreground">Also send this announcement via email to staff recipients</p>
                    </div>
                  </div>
                  <Switch checked={sendAsEmail} onCheckedChange={setSendAsEmail} />
                </div>

                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !title.trim() || !body.trim() || createMutation.isPending ||
                    (targetType === "parents_class" && !targetClass) ||
                    (targetType === "parents_specific" && selectedParentIds.length === 0) ||
                    (targetType === "staff_specific" && selectedStaffIds.length === 0)
                  }
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Publish Announcement
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4 min-w-0">
          {/* Announcement List */}
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">All Announcements</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {!filteredAnnouncements?.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No announcements yet. Create your first one!</p>
                </div>
              ) : (
                <div className="space-y-3 min-w-0">
                  {filteredAnnouncements.map((a: any) => (
                    <div
                      key={a.id}
                      className={`border rounded-lg p-3 sm:p-4 cursor-pointer hover:bg-muted/50 transition-colors min-w-0 ${selectedAnnouncement === a.id ? "border-primary bg-primary/5" : ""}`}
                      onClick={() => handleSelectAnnouncement(a.id)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold min-w-0 break-words flex-1">{a.title}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </span>
                          {canEdit && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{a.title}" and all read tracking data. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(a.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
                      <div className="mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          {getTargetLabel(a)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Read Tracking Panel */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" /> Read Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedData ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">{selectedData.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{selectedData.body}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={readFilter === "all" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setReadFilter("all")}
                    >
                      <Users className="h-3 w-3 mr-1" /> {totalRecipients} All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={readFilter === "read" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setReadFilter(readFilter === "read" ? "all" : "read")}
                    >
                      <Eye className="h-3 w-3 mr-1" /> {readCount} Read
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={readFilter === "unread" ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setReadFilter(readFilter === "unread" ? "all" : "unread")}
                    >
                      <EyeOff className="h-3 w-3 mr-1" /> {notReadCount} Not Read
                    </Button>
                  </div>
                  <ScrollArea className="h-[300px]">
                    {(() => {
                      const source = (enrichedRecipients ?? recipients) as any[];
                      const list = source.filter((member: any) => {
                        const hasRead = readParentIds.has(member.id);
                        if (readFilter === "read") return hasRead;
                        if (readFilter === "unread") return !hasRead;
                        return true;
                      });
                      if (!list.length) {
                        return (
                          <p className="text-center text-xs text-muted-foreground py-6">
                            No recipients in this view.
                          </p>
                        );
                      }
                      // Group by class / "Staff"
                      const groups = new Map<string, any[]>();
                      for (const m of list) {
                        const key = m.groupLabel ?? "Recipients";
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)!.push(m);
                      }
                      const isParentAudience = selectedData && !(
                        selectedData.target_type === "staff" ||
                        selectedData.target_type === "staff_all" ||
                        selectedData.target_type === "staff_specific"
                      );
                      const unreadInView = list.filter((m: any) => !readParentIds.has(m.id));
                      return (
                        <div className="space-y-3">
                          {isParentAudience && readFilter !== "read" && unreadInView.length > 0 && canEdit && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs"
                              onClick={() => remindAllUnread(unreadInView)}
                              disabled={remindingIds.length > 0}
                            >
                              <Bell className="h-3 w-3 mr-1" />
                              Remind all {unreadInView.length} unread
                            </Button>
                          )}
                          {Array.from(groups.entries())
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([groupName, members]) => (
                              <div key={groupName} className="space-y-1">
                                <div className="flex items-center gap-2 sticky top-0 bg-background py-1">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {groupName}
                                  </p>
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                    {members.length}
                                  </Badge>
                                </div>
                                {(() => {
                                  // Group members by child so both parents of the same
                                  // child appear stacked under one child heading.
                                  type Row = { key: string; childName: string; parents: any[] };
                                  const byChild = new Map<string, Row>();
                                  const parentsWithoutChild: any[] = [];
                                  for (const m of members) {
                                    const kids = (m.children ?? []) as any[];
                                    if (!kids.length) {
                                      parentsWithoutChild.push(m);
                                      continue;
                                    }
                                    for (const k of kids) {
                                      const name = `${k.first_name ?? ""} ${k.last_name ?? ""}`.trim() || "Unnamed";
                                      const key = k.id ?? name;
                                      if (!byChild.has(key)) byChild.set(key, { key, childName: name, parents: [] });
                                      byChild.get(key)!.parents.push(m);
                                    }
                                  }
                                  const rows: Row[] = Array.from(byChild.values()).sort((a, b) =>
                                    a.childName.localeCompare(b.childName)
                                  );
                                  if (parentsWithoutChild.length) {
                                    rows.push({ key: "__no_child__", childName: "No linked child", parents: parentsWithoutChild });
                                  }
                                  return rows.map((row) => (
                                    <div key={row.key} className="py-2 border-b last:border-0">
                                      {isParentAudience ? (
                                        <p className="text-sm font-semibold truncate">{row.childName}</p>
                                      ) : null}
                                      <div className="space-y-1 mt-1">
                                        {row.parents.map((member: any) => {
                                          const hasRead = readParentIds.has(member.id);
                                          const pName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "Recipient";
                                          return (
                                            <div key={member.id} className="flex items-center justify-between gap-2">
                                              <p className="text-xs text-muted-foreground truncate min-w-0">
                                                {isParentAudience ? "Parent: " : ""}{pName}
                                              </p>
                                              <div className="flex items-center gap-1 shrink-0">
                                                {!hasRead && isParentAudience && canEdit && (
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 px-2 text-[10px]"
                                                    onClick={() => sendReminder(member)}
                                                    disabled={remindingIds.includes(member.id)}
                                                    title="Send reminder via email + in-app notification"
                                                  >
                                                    {remindingIds.includes(member.id) ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <>
                                                        <Bell className="h-3 w-3 mr-1" />
                                                        Remind
                                                      </>
                                                    )}
                                                  </Button>
                                                )}
                                                <Badge
                                                  variant={hasRead ? "default" : "outline"}
                                                  className={`text-[10px] ${hasRead ? "bg-accent/15 text-accent" : "text-muted-foreground"}`}
                                                >
                                                  {hasRead ? "Read" : "Not Read"}
                                                </Badge>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            ))}
                        </div>
                      );
                    })()}
                  </ScrollArea>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">Select an announcement to see read status</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
