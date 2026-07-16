import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getOrCreateBillingProfile,
  addBillingProfileItem,
} from "@/lib/finance/pricing-service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Package, Plus, X, UserPlus, Pencil, Trash2, Users, Search, Percent, Layers, Clock, MoreHorizontal, Archive, RotateCcw, Eye, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import FeeVersionHistory from "@/components/finance/FeeVersionHistory";
import { toast } from "@/hooks/use-toast";
import { toastError } from "@/lib/error-messages";
import { PROGRAM_OPTIONS, programLabel, programBadgeVariant, type ProgramType } from "@/lib/programType";

const MAX_SUB_FEES = 10;

interface FeeRow { name: string; fee_type: string; amount: string; description: string; breakdownItems: BreakdownItem[]; }
interface BreakdownItem { id?: string; item_name: string; amount: string; }
const emptyFeeRow = (): FeeRow => ({ name: "", fee_type: "monthly", amount: "", description: "", breakdownItems: [] });
const rm = (v: number) => `RM ${Number(v).toFixed(2)}`;

const feeTypeBadge: Record<string, string> = {
  one_time: "bg-accent text-accent-foreground",
  monthly: "bg-primary/15 text-primary",
  term: "bg-secondary text-secondary-foreground",
  annual: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

const feeTypeLabel: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  term: "Termly",
  annual: "Annual",
};

interface DiscountEntry {
  packageId: string;
  selected: boolean;
  discountType: "fixed" | "percentage";
  discountValue: string;
}

interface EditSubFeeRow {
  id?: string;
  name: string;
  fee_type: string;
  amount: string;
  description: string;
  breakdownItems: BreakdownItem[];
  _deleted?: boolean;
  _isExisting?: boolean;
}

type PackageStatus = "active" | "draft" | "archived";

function getPackageStatus(fp: any, versions: any[]): PackageStatus {
  if (fp.is_active === false) return "archived";
  const hasVersions = versions.some((v: any) => v.fee_package_id === fp.id);
  if (!hasVersions) return "draft";
  return "active";
}

const statusBadgeClass: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

type ViewFilter = "all" | "individual" | "bundle";
type CreateMode = "individual" | "bundle" | null;

export default function FeePackagesTab({ branchId, canManage }: { branchId: string; canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackageStatus>("active");
  const [typeFilter, setTypeFilter] = useState<ViewFilter>("all");
  const [programFilter, setProgramFilter] = useState<"all" | ProgramType | "any">("all");

  // Detail sheet
  const [detailPkg, setDetailPkg] = useState<any>(null);

  // Create/Edit dialog
  const [showDialog, setShowDialog] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pkgName, setPkgName] = useState("");
  const [pkgDescription, setPkgDescription] = useState("");
  const [feeRows, setFeeRows] = useState<FeeRow[]>([emptyFeeRow()]);
  const [groupName, setGroupName] = useState("");
  // Bundle: selected existing packages
  const [bundleSelectedPkgs, setBundleSelectedPkgs] = useState<Set<string>>(new Set());
  const [groupDesc, setGroupDesc] = useState("");
  const [saveDraft, setSaveDraft] = useState(false);
  // Program type for the package(s) being created/edited.
  // null/empty stored as null → applies to both programs.
  const [pkgProgramType, setPkgProgramType] = useState<"" | ProgramType>("");

  // Bundle edit
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDesc, setEditGroupDesc] = useState("");
  const [editGroupSubFees, setEditGroupSubFees] = useState<EditSubFeeRow[]>([]);
  const [showExistingPicker, setShowExistingPicker] = useState(false);

  // Bulk assign
  const [bulkAssignPkg, setBulkAssignPkg] = useState<any>(null);
  const [bulkClass, setBulkClass] = useState("");
  const [bulkDiscount, setBulkDiscount] = useState("");
  const [bulkDiscountType, setBulkDiscountType] = useState<"fixed" | "percentage">("fixed");

  // Multi-assign
  const [showMultiAssign, setShowMultiAssign] = useState(false);
  const [multiAssignStudent, setMultiAssignStudent] = useState("");
  const [multiAssignEntries, setMultiAssignEntries] = useState<DiscountEntry[]>([]);

  // Force delete
  const [forceDeletePkg, setForceDeletePkg] = useState<any>(null);

  // Version history
  const [versionHistoryPkg, setVersionHistoryPkg] = useState<any>(null);

  // Collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Queries ──
  const { data: feePackages } = useQuery({
    queryKey: ["fee-packages", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("fee_packages").select("*").eq("branch_id", branchId).order("name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: allBreakdownItems } = useQuery({
    queryKey: ["fee-breakdown-items", branchId],
    queryFn: async () => {
      const pkgIds = feePackages?.map((fp: any) => fp.id) ?? [];
      if (!pkgIds.length) return [];
      const { data } = await supabase.from("fee_breakdown_items").select("*").in("fee_package_id", pkgIds).order("sort_order");
      return data ?? [];
    },
    enabled: !!branchId && !!feePackages?.length,
  });

  const { data: feeGroups } = useQuery({
    queryKey: ["fee-package-groups", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("fee_package_groups").select("*").eq("branch_id", branchId).order("name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: allVersions = [] } = useQuery({
    queryKey: ["fee-package-versions-all", branchId],
    queryFn: async () => {
      const pkgIds = feePackages?.map((fp: any) => fp.id) ?? [];
      if (!pkgIds.length) return [];
      const { data } = await supabase.from("fee_package_versions" as any).select("*").in("fee_package_id", pkgIds);
      return (data ?? []) as any[];
    },
    enabled: !!branchId && !!feePackages?.length,
  });

  const { data: students } = useQuery({
    queryKey: ["billing-students", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, first_name, last_name, class_name").eq("branch_id", branchId).eq("is_active", true).order("class_name").order("first_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const studentsByClass = useMemo(() => {
    const map = new Map<string, typeof students>();
    students?.forEach((s: any) => {
      const cls = s.class_name || "Unassigned";
      if (!map.has(cls)) map.set(cls, []);
      map.get(cls)!.push(s);
    });
    return map;
  }, [students]);

  const classNames = useMemo(() => Array.from(studentsByClass.keys()).sort(), [studentsByClass]);

  const { data: studentFees } = useQuery({
    queryKey: ["student-fees", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_fees")
        .select("*, students(first_name, last_name, class_name), fee_packages(name, amount, fee_type, group_id)")
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["fee-packages"] });
    queryClient.invalidateQueries({ queryKey: ["fee-package-groups"] });
    queryClient.invalidateQueries({ queryKey: ["student-fees"] });
    queryClient.invalidateQueries({ queryKey: ["fee-breakdown-items"] });
    queryClient.invalidateQueries({ queryKey: ["fee-package-versions-all"] });
    queryClient.invalidateQueries({ queryKey: ["billing-profile"] });
    queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
  };

  const calcDiscountRM = (type: "fixed" | "percentage", value: string, pkgAmount: number): number => {
    const v = parseFloat(value) || 0;
    if (type === "percentage") return Math.round((pkgAmount * v / 100) * 100) / 100;
    return v;
  };

  // ── Derived data ──
  const ungrouped = feePackages?.filter((fp: any) => !fp.group_id) ?? [];

  const packagesWithMeta = useMemo(() => {
    if (!feePackages) return [];
    return feePackages.map((fp: any) => {
      const status = getPackageStatus(fp, allVersions);
      const group = feeGroups?.find((g: any) => g.id === fp.group_id);
      const latestVersion = allVersions
        .filter((v: any) => v.fee_package_id === fp.id)
        .sort((a: any, b: any) => b.version_number - a.version_number)[0];
      const assignmentCount = studentFees?.filter((sf: any) => sf.fee_packages && sf.fee_packages.name === fp.name).length ?? 0;
      const monthlyEst = fp.fee_type === "monthly" ? fp.amount : fp.fee_type === "term" ? fp.amount / 3 : 0;
      const isBundle = !!fp.group_id;
      return { ...fp, status, group, latestVersion, assignmentCount, monthlyEst, isBundle };
    });
  }, [feePackages, allVersions, feeGroups, studentFees]);

  const filteredPackages = useMemo(() => {
    return packagesWithMeta.filter(fp => {
      if (fp.status !== statusFilter) return false;
      if (typeFilter === "individual" && fp.isBundle) return false;
      if (typeFilter === "bundle" && !fp.isBundle) return false;
      if (programFilter === "taska" && fp.program_type !== "taska") return false;
      if (programFilter === "preschool" && fp.program_type !== "preschool") return false;
      if (programFilter === "any" && fp.program_type) return false;
      if (searchQuery && !fp.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [packagesWithMeta, statusFilter, typeFilter, programFilter, searchQuery]);

  // Separate into bundles and individual
  const bundlePackages = useMemo(() => filteredPackages.filter(fp => fp.isBundle), [filteredPackages]);
  const individualPackages = useMemo(() => filteredPackages.filter(fp => !fp.isBundle), [filteredPackages]);

  const stats = useMemo(() => {
    const active = packagesWithMeta.filter(fp => fp.status === "active").length;
    const draft = packagesWithMeta.filter(fp => fp.status === "draft").length;
    const archived = packagesWithMeta.filter(fp => fp.status === "archived").length;
    const activePkgs = packagesWithMeta.filter(fp => fp.status === "active");
    const freqCounts = {
      one_time: activePkgs.filter(fp => fp.fee_type === "one_time").length,
      monthly: activePkgs.filter(fp => fp.fee_type === "monthly").length,
      term: activePkgs.filter(fp => fp.fee_type === "term").length,
      annual: activePkgs.filter(fp => fp.fee_type === "annual").length,
    };
    return { active, draft, archived, freqCounts };
  }, [packagesWithMeta]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      if (createMode === "bundle") {
        // Bundle creation: create group, then link selected existing packages + any new fee rows
        if (!groupName.trim()) throw new Error("Bundle name is required");
        const { data: group, error: gErr } = await supabase.from("fee_package_groups").insert({
          branch_id: branchId, name: groupName.trim(), description: pkgDescription || null,
        }).select().single();
        if (gErr) throw gErr;

        // Link selected existing individual packages to this bundle
        for (const pkgId of bundleSelectedPkgs) {
          await supabase.from("fee_packages").update({ group_id: group.id }).eq("id", pkgId);
        }

        // Also create any new fee rows added manually
        const validRows = feeRows.filter(r => r.name && r.amount);
        for (const r of validRows) {
          const { data: pkg, error } = await supabase.from("fee_packages").insert({
            branch_id: branchId, name: r.name, fee_type: r.fee_type,
            amount: parseFloat(r.amount), description: r.description || null, group_id: group.id,
            is_active: !saveDraft,
            program_type: pkgProgramType || null,
          }).select().single();
          if (error) throw error;
          if (!saveDraft) {
            await supabase.from("fee_package_versions" as any).insert({
              fee_package_id: pkg.id, version_number: 1,
              amount: parseFloat(r.amount), effective_from: new Date().toISOString().split("T")[0],
              change_reason: "Initial rate", changed_by: user?.id,
            });
          }
        }
      } else {
        // Individual creation
        const validRows = feeRows.filter(r => r.name && r.amount);
        if (!validRows.length) throw new Error("Add at least one fee");

        for (const r of validRows) {
          const { data: pkg, error } = await supabase.from("fee_packages").insert({
            branch_id: branchId, name: r.name, fee_type: r.fee_type,
            amount: parseFloat(r.amount), description: r.description || null, group_id: null,
            is_active: !saveDraft,
            program_type: pkgProgramType || null,
          }).select().single();
          if (error) throw error;

          if (!saveDraft) {
            await supabase.from("fee_package_versions" as any).insert({
              fee_package_id: pkg.id, version_number: 1,
              amount: parseFloat(r.amount), effective_from: new Date().toISOString().split("T")[0],
              change_reason: "Initial rate", changed_by: user?.id,
            });
          }

          const validItems = r.breakdownItems.filter(bi => bi.item_name.trim());
          if (validItems.length > 0) {
            await supabase.from("fee_breakdown_items").insert(
              validItems.map((bi, idx) => ({
                fee_package_id: pkg.id, item_name: bi.item_name.trim(),
                amount: parseFloat(bi.amount) || 0, sort_order: idx,
              }))
            );
          }
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      closeCreateDialog();
      toast({ title: saveDraft ? "Package saved as draft" : createMode === "bundle" ? "Bundle created" : "Fee package created" });
    },
    onError: (e: any) => toastError(e),
  });

  const editPkgMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const row = feeRows[0];
      const { error } = await supabase.from("fee_packages").update({
        name: row.name, amount: parseFloat(row.amount), fee_type: row.fee_type, description: row.description || null,
        program_type: pkgProgramType || null,
      }).eq("id", editingId);
      if (error) throw error;

      await supabase.from("fee_breakdown_items").delete().eq("fee_package_id", editingId);
      const validItems = row.breakdownItems.filter(bi => bi.item_name.trim());
      if (validItems.length > 0) {
        await supabase.from("fee_breakdown_items").insert(
          validItems.map((bi, idx) => ({
            fee_package_id: editingId!, item_name: bi.item_name.trim(),
            amount: parseFloat(bi.amount) || 0, sort_order: idx,
          }))
        );
      }
    },
    onSuccess: () => { invalidateAll(); closeCreateDialog(); toast({ title: "Fee package updated" }); },
    onError: (e: any) => toastError(e),
  });

  const deletePkgMutation = useMutation({
    mutationFn: async (pkg: any) => {
      const { count: itemCount } = await supabase.from("invoice_items").select("id", { count: "exact", head: true }).eq("fee_package_id", pkg.id);
      const { count: feeCount } = await supabase.from("student_fees").select("id", { count: "exact", head: true }).eq("fee_package_id", pkg.id).eq("is_active", true);
      if ((itemCount ?? 0) > 0 || (feeCount ?? 0) > 0) {
        setForceDeletePkg(pkg);
        return;
      }
      const { error } = await supabase.from("fee_packages").delete().eq("id", pkg.id);
      if (error) throw error;
      if (pkg.group_id) {
        const { count } = await supabase.from("fee_packages").select("id", { count: "exact", head: true }).eq("group_id", pkg.group_id).neq("id", pkg.id);
        if ((count ?? 0) === 0) await supabase.from("fee_package_groups").delete().eq("id", pkg.group_id);
      }
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Fee package removed" }); },
    onError: (e: any) => toastError(e),
  });

  const forceDeleteMutation = useMutation({
    mutationFn: async (pkg: any) => {
      await supabase.from("student_fees").update({ is_active: false }).eq("fee_package_id", pkg.id);
      const { error } = await supabase.from("fee_packages").delete().eq("id", pkg.id);
      if (error) throw error;
      if (pkg.group_id) {
        const { count } = await supabase.from("fee_packages").select("id", { count: "exact", head: true }).eq("group_id", pkg.group_id).neq("id", pkg.id);
        if ((count ?? 0) === 0) await supabase.from("fee_package_groups").delete().eq("id", pkg.group_id);
      }
    },
    onSuccess: () => { invalidateAll(); setForceDeletePkg(null); toast({ title: "Fee package permanently deleted" }); },
    onError: (e: any) => toastError(e),
  });

  const togglePkgActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("fee_packages").update({ is_active }).eq("id", id);
      if (error) throw error;
      if (is_active) {
        const hasVersions = allVersions.some((v: any) => v.fee_package_id === id);
        if (!hasVersions) {
          const pkg = feePackages?.find((fp: any) => fp.id === id);
          if (pkg) {
            await supabase.from("fee_package_versions" as any).insert({
              fee_package_id: id, version_number: 1,
              amount: pkg.amount, effective_from: new Date().toISOString().split("T")[0],
              change_reason: "Activated from draft", changed_by: user?.id,
            });
          }
        }
      }
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Status updated" }); },
  });

  const editGroupMutation = useMutation({
    mutationFn: async () => {
      const { error: gErr } = await supabase.from("fee_package_groups").update({ name: editGroupName, description: editGroupDesc || null }).eq("id", editingGroup.id);
      if (gErr) throw gErr;
      for (const row of editGroupSubFees) {
        if (row._deleted && row.id) {
          await supabase.from("fee_packages").update({ group_id: null }).eq("id", row.id);
        } else if (row.id) {
          await supabase.from("fee_packages").update({
            name: row.name, fee_type: row.fee_type,
            amount: parseFloat(row.amount) || 0, description: row.description || null,
            group_id: editingGroup.id,
          }).eq("id", row.id);
          await supabase.from("fee_breakdown_items").delete().eq("fee_package_id", row.id);
          const validItems = row.breakdownItems.filter(bi => bi.item_name.trim());
          if (validItems.length > 0) {
            await supabase.from("fee_breakdown_items").insert(
              validItems.map((bi, idx) => ({
                fee_package_id: row.id!, item_name: bi.item_name.trim(),
                amount: parseFloat(bi.amount) || 0, sort_order: idx,
              }))
            );
          }
        } else if (!row._deleted && row.name && row.amount) {
          const { data: newPkg } = await supabase.from("fee_packages").insert({
            branch_id: branchId, name: row.name, fee_type: row.fee_type,
            amount: parseFloat(row.amount) || 0, description: row.description || null,
            group_id: editingGroup.id,
          }).select().single();
          if (newPkg) {
            const validItems = row.breakdownItems.filter(bi => bi.item_name.trim());
            if (validItems.length > 0) {
              await supabase.from("fee_breakdown_items").insert(
                validItems.map((bi, idx) => ({
                  fee_package_id: newPkg.id, item_name: bi.item_name.trim(),
                  amount: parseFloat(bi.amount) || 0, sort_order: idx,
                }))
              );
            }
          }
        }
      }
    },
    onSuccess: () => { invalidateAll(); setEditingGroup(null); toast({ title: "Bundle updated" }); },
    onError: (e: any) => toastError(e),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await supabase.from("fee_packages").update({ group_id: null }).eq("group_id", groupId);
      const { error } = await supabase.from("fee_package_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Bundle deleted" }); },
    onError: (e: any) => toastError(e),
  });

  const multiAssignMutation = useMutation({
    mutationFn: async () => {
      const selected = multiAssignEntries.filter(e => e.selected);
      if (!selected.length) throw new Error("Select at least one package");
      if (!multiAssignStudent) throw new Error("Select a student");

      // Write to legacy student_fees for backward compat
      const records = selected.map(e => {
        const pkg = feePackages?.find((fp: any) => fp.id === e.packageId);
        return {
          student_id: multiAssignStudent,
          fee_package_id: e.packageId,
          discount_amount: calcDiscountRM(e.discountType, e.discountValue, pkg?.amount ?? 0),
          is_active: true,
        };
      });
      const { error } = await supabase.from("student_fees").insert(records);
      if (error) throw error;

      // Also write to billing_profile_items via pricing service
      const profile = await getOrCreateBillingProfile({
        studentId: multiAssignStudent,
        branchId,
        actorId: user!.id,
      });

      for (const e of selected) {
        const pkg = feePackages?.find((fp: any) => fp.id === e.packageId);
        // Get latest version
        const { data: verData } = await supabase
          .from("fee_package_versions" as any)
          .select("id")
          .eq("fee_package_id", e.packageId)
          .order("version_number", { ascending: false })
          .limit(1);
        const verRows = (verData ?? []) as unknown as { id: string }[];

        await addBillingProfileItem({
          profileId: profile.id,
          packageId: e.packageId,
          versionId: verRows[0]?.id,
          discountAmount: calcDiscountRM(e.discountType, e.discountValue, pkg?.amount ?? 0),
          effectiveFrom: new Date().toISOString().split("T")[0],
          actorId: user!.id,
          branchId,
        });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setShowMultiAssign(false);
      setMultiAssignStudent("");
      setMultiAssignEntries([]);
      toast({ title: "Fees assigned successfully" });
    },
    onError: (e: any) => toastError(e),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      const classStudents = studentsByClass.get(bulkClass) ?? [];
      if (!classStudents.length) throw new Error("No students in selected class");
      const discountRM = calcDiscountRM(bulkDiscountType, bulkDiscount, bulkAssignPkg?.amount ?? 0);

      // Write to legacy student_fees
      const records = classStudents.map((s: any) => ({
        student_id: s.id, fee_package_id: bulkAssignPkg.id,
        discount_amount: discountRM, is_active: true,
      }));
      const { error } = await supabase.from("student_fees").insert(records);
      if (error) throw error;

      // Also write to billing_profile_items
      // Get latest version for this package
      const { data: verData } = await supabase
        .from("fee_package_versions" as any)
        .select("id")
        .eq("fee_package_id", bulkAssignPkg.id)
        .order("version_number", { ascending: false })
        .limit(1);
      const verRows = (verData ?? []) as unknown as { id: string }[];

      for (const s of classStudents as any[]) {
        const profile = await getOrCreateBillingProfile({
          studentId: s.id,
          branchId,
          actorId: user!.id,
        });
        await addBillingProfileItem({
          profileId: profile.id,
          packageId: bulkAssignPkg.id,
          versionId: verRows[0]?.id,
          discountAmount: discountRM,
          effectiveFrom: new Date().toISOString().split("T")[0],
          actorId: user!.id,
          branchId,
        });
      }
    },
    onSuccess: () => { invalidateAll(); setBulkAssignPkg(null); setBulkClass(""); setBulkDiscount(""); setBulkDiscountType("fixed"); toast({ title: `Assigned to all students in ${bulkClass}` }); },
    onError: (e: any) => toastError(e),
  });

  // ── Helpers ──
  const closeCreateDialog = () => {
    setShowDialog(false);
    setCreateMode(null);
    setIsEditing(false);
    setEditingId(null);
    setPkgName("");
    setPkgDescription("");
    setFeeRows([emptyFeeRow()]);
    setGroupName("");
    setSaveDraft(false);
    setBundleSelectedPkgs(new Set());
    setPkgProgramType("");
  };

  const openCreate = () => {
    closeCreateDialog();
    setCreateMode(null);
    setShowDialog(true);
  };

  const openCreateIndividual = () => {
    closeCreateDialog();
    setCreateMode("individual");
    setShowDialog(true);
  };

  const openCreateBundle = () => {
    closeCreateDialog();
    setCreateMode("bundle");
    setFeeRows([]);
    setShowDialog(true);
  };

  const openEdit = (fp: any) => {
    const items = allBreakdownItems?.filter((bi: any) => bi.fee_package_id === fp.id) ?? [];
    setIsEditing(true);
    setEditingId(fp.id);
    setPkgName(fp.name);
    setPkgDescription(fp.description || "");
    setPkgProgramType((fp.program_type as ProgramType) ?? "");
    setFeeRows([{
      name: fp.name, fee_type: fp.fee_type, amount: String(fp.amount),
      description: fp.description || "",
      breakdownItems: items.map((bi: any) => ({ id: bi.id, item_name: bi.item_name, amount: String(bi.amount) })),
    }]);
    setGroupName("");
    setGroupDesc("");
    setShowDialog(true);
  };

  const startEditGroup = (g: any) => {
    setEditingGroup(g);
    setEditGroupName(g.name);
    setEditGroupDesc(g.description || "");
    const subFees = feePackages?.filter((fp: any) => fp.group_id === g.id) ?? [];
    setEditGroupSubFees(subFees.map((fp: any) => {
      const items = allBreakdownItems?.filter((bi: any) => bi.fee_package_id === fp.id) ?? [];
      return {
        id: fp.id, name: fp.name, fee_type: fp.fee_type,
        amount: String(fp.amount), description: fp.description || "",
        breakdownItems: items.map((bi: any) => ({ id: bi.id, item_name: bi.item_name, amount: String(bi.amount) })),
        _isExisting: true,
      };
    }));
    setShowExistingPicker(false);
  };

  const openMultiAssign = () => {
    const activePackages = packagesWithMeta.filter(fp => fp.status === "active");
    setMultiAssignEntries(activePackages.map(fp => ({
      packageId: fp.id, selected: false, discountType: "fixed" as const, discountValue: "",
    })));
    setMultiAssignStudent("");
    setShowMultiAssign(true);
  };

  const updateFeeRow = (index: number, field: keyof FeeRow, value: string) => {
    setFeeRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const updateEditSubFee = (index: number, field: keyof EditSubFeeRow, value: string) => {
    setEditGroupSubFees(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const activeEditSubFees = editGroupSubFees.filter(r => !r._deleted);

  const discountInput = (
    type: "fixed" | "percentage",
    onTypeChange: (t: "fixed" | "percentage") => void,
    value: string,
    onValueChange: (v: string) => void,
    pkgAmount?: number,
    compact?: boolean,
  ) => {
    const hasDiscount = value && parseFloat(value) > 0;
    const discountAmt = pkgAmount !== undefined ? calcDiscountRM(type, value, pkgAmount) : 0;
    const netAmt = pkgAmount !== undefined ? pkgAmount - discountAmt : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Input type="number" className={`${compact ? "w-[70px]" : "w-[80px]"} h-8 text-xs pr-1`} placeholder="0" value={value} onChange={e => onValueChange(e.target.value)} />
          <div className="flex items-center rounded-md border border-input h-8 overflow-hidden">
            <button type="button" onClick={() => onTypeChange("fixed")} className={`px-2 h-full text-xs font-medium transition-colors ${type === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>RM</button>
            <button type="button" onClick={() => onTypeChange("percentage")} className={`px-2 h-full text-xs font-medium transition-colors ${type === "percentage" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>%</button>
          </div>
        </div>
        {pkgAmount !== undefined && hasDiscount && (
          <p className="text-[11px] text-primary font-medium">−{rm(discountAmt)} → Net: {rm(netAmt)}</p>
        )}
      </div>
    );
  };

  // ── Detail sheet data ──
  const detailBreakdown = detailPkg ? (allBreakdownItems?.filter((bi: any) => bi.fee_package_id === detailPkg.id) ?? []) : [];
  const detailVersions = detailPkg ? allVersions.filter((v: any) => v.fee_package_id === detailPkg.id).sort((a: any, b: any) => b.version_number - a.version_number) : [];
  const detailStatus = detailPkg ? getPackageStatus(detailPkg, allVersions) : "draft";
  const detailMonthlyEst = detailPkg ? (detailPkg.fee_type === "monthly" ? detailPkg.amount : detailPkg.fee_type === "term" ? detailPkg.amount / 3 : 0) : 0;
  const detailTermEst = detailPkg ? (detailPkg.fee_type === "term" ? detailPkg.amount : detailPkg.fee_type === "monthly" ? detailPkg.amount * 3 : detailPkg.amount) : 0;

  // ── Render table rows for a group of packages ──
  const renderPackageRow = (fp: any) => (
    <TableRow
      key={fp.id}
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => setDetailPkg(fp)}
    >
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {fp.isBundle && <Layers className="h-3.5 w-3.5 text-primary shrink-0" />}
          <span>{fp.name}</span>
          {fp.group && <Badge variant="outline" className="text-[10px]">{fp.group.name}</Badge>}
          {fp.program_type && (
            <Badge variant={programBadgeVariant(fp.program_type)} className="text-[10px]">
              {programLabel(fp.program_type)}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge className={`text-[10px] ${feeTypeBadge[fp.fee_type] || ""}`}>{feeTypeLabel[fp.fee_type] || fp.fee_type}</Badge>
      </TableCell>
      <TableCell>
        {fp.latestVersion ? (
          <Badge variant="outline" className="text-[10px]">v{fp.latestVersion.version_number}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-semibold">{rm(fp.amount)}</TableCell>
      <TableCell className="text-right text-muted-foreground text-sm">
        {fp.monthlyEst > 0 ? rm(fp.monthlyEst) : "—"}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary" className="text-[10px]">{fp.assignmentCount}</Badge>
      </TableCell>
      {canManage && (
        <TableCell onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailPkg(fp)}><Eye className="h-3.5 w-3.5 mr-2" /> View Detail</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEdit(fp)}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setVersionHistoryPkg(fp)}><Clock className="h-3.5 w-3.5 mr-2" /> Rate History</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkAssignPkg(fp)}><Users className="h-3.5 w-3.5 mr-2" /> Bulk Assign</DropdownMenuItem>
              <DropdownMenuSeparator />
              {fp.status === "draft" && (
                <DropdownMenuItem onClick={() => togglePkgActive.mutate({ id: fp.id, is_active: true })}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" /> Activate
                </DropdownMenuItem>
              )}
              {fp.status === "active" && (
                <DropdownMenuItem onClick={() => togglePkgActive.mutate({ id: fp.id, is_active: false })}>
                  <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                </DropdownMenuItem>
              )}
              {fp.status === "archived" && (
                <DropdownMenuItem onClick={() => togglePkgActive.mutate({ id: fp.id, is_active: true })}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" /> Restore
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deletePkgMutation.mutate(fp)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
        <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${statusFilter === "active" ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter("active")}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${statusFilter === "draft" ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter("draft")}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Draft</p>
            <p className="text-xl font-bold text-muted-foreground">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-sm transition-shadow ${statusFilter === "archived" ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter("archived")}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Archived</p>
            <p className="text-xl font-bold text-amber-600">{stats.archived}</p>
          </CardContent>
        </Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">One-time</p><p className="text-xl font-bold">{stats.freqCounts.one_time}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Monthly</p><p className="text-xl font-bold">{stats.freqCounts.monthly}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Termly</p><p className="text-xl font-bold">{stats.freqCounts.term}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Annual</p><p className="text-xl font-bold">{stats.freqCounts.annual}</p></CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search packages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PackageStatus)}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ViewFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="bundle">Bundle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={(v) => setProgramFilter(v as any)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            <SelectItem value="preschool">Preschool</SelectItem>
            <SelectItem value="taska">Taska</SelectItem>
            <SelectItem value="any">Both / Unspecified</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <>
            <Button variant="outline" onClick={openMultiAssign} className="gap-2 text-sm">
              <UserPlus className="h-4 w-4" /> Assign Fees
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Create Package
            </Button>
          </>
        )}
      </div>

      {/* Fee Catalog — Bundles then Individual */}
      {!filteredPackages.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {searchQuery || typeFilter !== "all" ? "No packages match your filters." : `No ${statusFilter} fee packages.`}
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {/* Bundles Section */}
          {bundlePackages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Bundles</h3>
                <Badge variant="secondary" className="text-[10px]">{bundlePackages.length}</Badge>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead>Name</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Monthly Est.</TableHead>
                      <TableHead className="text-center">Assigned</TableHead>
                      {canManage && <TableHead className="w-[60px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bundlePackages.map(renderPackageRow)}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Individual Packages Section */}
          {individualPackages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Individual Packages</h3>
                <Badge variant="secondary" className="text-[10px]">{individualPackages.length}</Badge>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead>Name</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Monthly Est.</TableHead>
                      <TableHead className="text-center">Assigned</TableHead>
                      {canManage && <TableHead className="w-[60px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {individualPackages.map(renderPackageRow)}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail Sheet ── */}
      <Sheet open={!!detailPkg} onOpenChange={o => { if (!o) setDetailPkg(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {detailPkg && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {detailPkg.name}
                  <Badge className={`text-[10px] capitalize ${statusBadgeClass[detailStatus]}`}>{detailStatus}</Badge>
                </SheetTitle>
                <SheetDescription>
                  {detailPkg.group ? `Bundle: ${detailPkg.group?.name ?? ""}` : "Individual package"} · {detailPkg.fee_type?.replace("_", " ")}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Current Rate</p>
                    <p className="text-lg font-bold">{rm(detailPkg.amount)}</p>
                    {detailVersions[0] && <p className="text-[10px] text-muted-foreground">v{detailVersions[0].version_number}</p>}
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Monthly / Term Est.</p>
                    <p className="text-sm font-semibold">{rm(detailMonthlyEst)} / {rm(detailTermEst)}</p>
                  </div>
                </div>

                {/* Description */}
                {detailPkg.description && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-line">{detailPkg.description}</p>
                  </div>
                )}

                {/* Fee Items / Breakdown */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Fee Items ({detailBreakdown.length})</p>
                  {detailBreakdown.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailBreakdown.map((bi: any) => (
                            <TableRow key={bi.id}>
                              <TableCell className="text-sm">{bi.item_name}</TableCell>
                              <TableCell className="text-right font-medium">{rm(bi.amount)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-semibold bg-muted/20">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">{rm(detailBreakdown.reduce((s: number, bi: any) => s + Number(bi.amount), 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">
                      No itemized breakdown. Package is billed as a single line item.
                    </p>
                  )}
                </div>

                {/* Version History */}
                {detailVersions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Version History</p>
                    <div className="space-y-2">
                      {detailVersions.slice(0, 5).map((v: any) => (
                        <div key={v.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">v{v.version_number}</Badge>
                            <span className="font-medium">{rm(v.amount)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{v.effective_from}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {canManage && (
                  <div className="flex gap-2 pt-2 border-t flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => { setDetailPkg(null); openEdit(detailPkg); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setDetailPkg(null); setVersionHistoryPkg(detailPkg); }}>
                      <Clock className="h-3.5 w-3.5 mr-1.5" /> Rate History
                    </Button>
                    {detailStatus === "draft" && (
                      <Button size="sm" onClick={() => { togglePkgActive.mutate({ id: detailPkg.id, is_active: true }); setDetailPkg(null); }}>
                        Activate
                      </Button>
                    )}
                    {detailStatus === "active" && (
                      <Button variant="outline" size="sm" onClick={() => { togglePkgActive.mutate({ id: detailPkg.id, is_active: false }); setDetailPkg(null); }}>
                        <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
                      </Button>
                    )}
                    {detailStatus === "archived" && (
                      <Button variant="outline" size="sm" onClick={() => { togglePkgActive.mutate({ id: detailPkg.id, is_active: true }); setDetailPkg(null); }}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restore
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={showDialog} onOpenChange={o => { if (!o) closeCreateDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Mode Selection Screen */}
          {!isEditing && !createMode && (
            <>
              <DialogHeader>
                <DialogTitle>Create Fee Package</DialogTitle>
                <DialogDescription>Choose what type of fee package to create.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                <button
                  onClick={openCreateIndividual}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                >
                  <div className="rounded-full bg-primary/10 p-3">
                    <Package className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Individual Package</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a single fee item like tuition, uniform, or registration.</p>
                  </div>
                </button>
                <button
                  onClick={openCreateBundle}
                  className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 text-center transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                >
                  <div className="rounded-full bg-primary/10 p-3">
                    <Layers className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Bundle Package</p>
                    <p className="text-xs text-muted-foreground mt-1">Group existing individual packages into a combined bundle.</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Individual Package Form */}
          {(isEditing || createMode === "individual") && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  {isEditing ? "Edit Fee Package" : "Create Individual Package"}
                </DialogTitle>
                <DialogDescription>
                  {isEditing ? "Update package details and fee breakdown." : "Define a single fee item with optional itemized breakdown."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Program</Label>
                  <Select value={pkgProgramType || "__both__"} onValueChange={(v) => setPkgProgramType(v === "__both__" ? "" : (v as ProgramType))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__both__">Both Programs (Preschool & Taska)</SelectItem>
                      {PROGRAM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Choose the program this package applies to, or leave on Both.</p>
                </div>
                {feeRows.map((row, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Fee Name</Label>
                        <Input placeholder="e.g. Monthly Tuition" value={row.name} onChange={e => updateFeeRow(idx, "name", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Frequency</Label>
                        <Select value={row.fee_type} onValueChange={v => updateFeeRow(idx, "fee_type", v)}>
                          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one_time">One-time</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="term">Termly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Amount (RM)</Label>
                        <Input type="number" className="w-[100px]" value={row.amount} onChange={e => updateFeeRow(idx, "amount", e.target.value)} />
                      </div>
                    </div>

                    {/* Breakdown Items */}
                    <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground font-medium">Breakdown Items (optional)</Label>
                        <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-0.5" onClick={() => {
                          setFeeRows(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: [...r.breakdownItems, { item_name: "", amount: "" }] } : r));
                        }}><Plus className="h-2.5 w-2.5" /> Item</Button>
                      </div>
                      {row.breakdownItems.length > 0 ? row.breakdownItems.map((bi, biIdx) => (
                        <div key={biIdx} className="flex items-center gap-2">
                          <Input className="flex-1 h-7 text-xs" placeholder="Item name" value={bi.item_name}
                            onChange={e => {
                              setFeeRows(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.map((b, j) => j === biIdx ? { ...b, item_name: e.target.value } : b) } : r));
                            }} />
                          <Input className="w-[80px] h-7 text-xs" type="number" placeholder="RM" value={bi.amount}
                            onChange={e => {
                              setFeeRows(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.map((b, j) => j === biIdx ? { ...b, amount: e.target.value } : b) } : r));
                            }} />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => {
                            setFeeRows(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.filter((_, j) => j !== biIdx) } : r));
                          }}><X className="h-2.5 w-2.5" /></Button>
                        </div>
                      )) : (
                        <p className="text-[10px] text-muted-foreground text-center py-1">No breakdown items — click "+ Item" to add</p>
                      )}
                      {row.breakdownItems.filter(bi => bi.item_name.trim()).length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Breakdown total: {rm(row.breakdownItems.reduce((s, bi) => s + (parseFloat(bi.amount) || 0), 0))}
                          {Math.abs(row.breakdownItems.reduce((s, bi) => s + (parseFloat(bi.amount) || 0), 0) - (parseFloat(row.amount) || 0)) > 0.01 && (
                            <span className="text-amber-600 ml-2">
                              (differs from fee amount by {rm(Math.abs(row.breakdownItems.reduce((s, bi) => s + (parseFloat(bi.amount) || 0), 0) - (parseFloat(row.amount) || 0)))})
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {isEditing && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <Textarea className="min-h-[50px] text-sm mt-1" placeholder="Additional notes..." value={row.description} onChange={e => updateFeeRow(idx, "description", e.target.value)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeCreateDialog}>Cancel</Button>
                {isEditing ? (
                  <Button onClick={() => editPkgMutation.mutate()} disabled={!feeRows[0]?.name || !feeRows[0]?.amount || editPkgMutation.isPending}>
                    {editPkgMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => { setSaveDraft(true); setTimeout(() => createMutation.mutate(), 0); }}
                      disabled={!feeRows.some(r => r.name && r.amount) || createMutation.isPending}>
                      Save as Draft
                    </Button>
                    <Button onClick={() => { setSaveDraft(false); createMutation.mutate(); }}
                      disabled={!feeRows.some(r => r.name && r.amount) || createMutation.isPending}>
                      {createMutation.isPending ? "Creating…" : "Create & Activate"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}

          {/* Bundle Form */}
          {!isEditing && createMode === "bundle" && (() => {
            const availableIndividual = packagesWithMeta.filter(fp => !fp.isBundle && fp.status === "active");
            const selectedPkgs = availableIndividual.filter(fp => bundleSelectedPkgs.has(fp.id));
            const bundleTotal = selectedPkgs.reduce((s, fp) => s + fp.amount, 0) + feeRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    Create Bundle Package
                  </DialogTitle>
                  <DialogDescription>
                    Group existing individual packages together. You can also add new fee items.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Bundle Name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Bundle Name *</Label>
                    <Input placeholder="e.g. Kindergarten Package" value={groupName} onChange={e => setGroupName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Input placeholder="e.g. Standard fees for kindergarten" value={pkgDescription} onChange={e => setPkgDescription(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Program</Label>
                    <Select value={pkgProgramType || "__both__"} onValueChange={(v) => setPkgProgramType(v === "__both__" ? "" : (v as ProgramType))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__both__">Both Programs (Preschool & Taska)</SelectItem>
                        {PROGRAM_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Applies to any new fee rows created in this bundle.</p>
                  </div>

                  {/* Select existing packages */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Select Individual Packages</Label>
                    <div className="border rounded-lg max-h-[200px] overflow-y-auto divide-y">
                      {availableIndividual.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No active individual packages to add.</p>
                      ) : availableIndividual.map(fp => (
                        <label key={fp.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors">
                          <Checkbox
                            checked={bundleSelectedPkgs.has(fp.id)}
                            onCheckedChange={(checked) => {
                              setBundleSelectedPkgs(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(fp.id); else next.delete(fp.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{fp.name}</span>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${feeTypeBadge[fp.fee_type] || ""}`}>{feeTypeLabel[fp.fee_type] || fp.fee_type}</Badge>
                          <span className="text-sm font-semibold shrink-0">{rm(fp.amount)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Add new sub-fees to the bundle */}
                  {feeRows.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Additional New Fees</Label>
                      {feeRows.map((row, idx) => (
                        <div key={idx} className="border rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Fee Name</Label>
                              <Input placeholder="e.g. Art Materials" value={row.name} onChange={e => updateFeeRow(idx, "name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Frequency</Label>
                              <Select value={row.fee_type} onValueChange={v => updateFeeRow(idx, "fee_type", v)}>
                                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="one_time">One-time</SelectItem>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                  <SelectItem value="term">Termly</SelectItem>
                                  <SelectItem value="annual">Annual</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">RM</Label>
                              <Input type="number" className="w-[90px]" value={row.amount} onChange={e => updateFeeRow(idx, "amount", e.target.value)} />
                            </div>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setFeeRows(prev => prev.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setFeeRows(prev => [...prev, emptyFeeRow()])}>
                    <Plus className="h-3.5 w-3.5" /> Add New Fee to Bundle
                  </Button>

                  {/* Bundle Summary */}
                  {(bundleSelectedPkgs.size > 0 || feeRows.some(r => r.name && r.amount)) && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">Bundle Summary</p>
                      <div className="flex justify-between text-sm">
                        <span>{bundleSelectedPkgs.size} existing + {feeRows.filter(r => r.name && r.amount).length} new</span>
                        <span className="font-bold text-primary">Total: {rm(bundleTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={closeCreateDialog}>Cancel</Button>
                  <Button variant="outline" onClick={() => { setSaveDraft(true); setTimeout(() => createMutation.mutate(), 0); }}
                    disabled={!groupName.trim() || (bundleSelectedPkgs.size === 0 && !feeRows.some(r => r.name && r.amount)) || createMutation.isPending}>
                    Save as Draft
                  </Button>
                  <Button onClick={() => { setSaveDraft(false); createMutation.mutate(); }}
                    disabled={!groupName.trim() || (bundleSelectedPkgs.size === 0 && !feeRows.some(r => r.name && r.amount)) || createMutation.isPending}>
                    {createMutation.isPending ? "Creating…" : "Create Bundle"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit Bundle Dialog ── */}
      <Dialog open={!!editingGroup} onOpenChange={o => { if (!o) setEditingGroup(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Bundle</DialogTitle>
            <DialogDescription>Manage bundle details and sub-fees.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="space-y-2"><Label>Bundle Name</Label><Input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Description</Label><Input value={editGroupDesc} onChange={e => setEditGroupDesc(e.target.value)} /></div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Sub-Fees ({activeEditSubFees.length}/{MAX_SUB_FEES})</Label>
              <span className="text-sm font-semibold text-primary">
                Total: {rm(activeEditSubFees.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0))}
              </span>
            </div>

            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
              {editGroupSubFees.map((row, idx) => {
                if (row._deleted) return null;
                return (
                  <div key={row.id || `new-${idx}`} className="border rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                      <div className="space-y-1"><Label className="text-xs">Fee Name</Label><Input value={row.name} onChange={e => updateEditSubFee(idx, "name", e.target.value)} /></div>
                      <div className="space-y-1"><Label className="text-xs">Type</Label>
                        <Select value={row.fee_type} onValueChange={v => updateEditSubFee(idx, "fee_type", v)}>
                          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="one_time">One-time</SelectItem><SelectItem value="term">Termly</SelectItem><SelectItem value="annual">Annual</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Amount (RM)</Label><Input type="number" className="w-[100px]" value={row.amount} onChange={e => updateEditSubFee(idx, "amount", e.target.value)} /></div>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => {
                        setEditGroupSubFees(prev => prev.map((r, i) => i === idx ? { ...r, _deleted: true } : r));
                      }}><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="border-t pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">Breakdown Items</Label>
                        <Button variant="ghost" size="sm" className="text-[10px] h-6 gap-0.5" onClick={() => {
                          setEditGroupSubFees(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: [...r.breakdownItems, { item_name: "", amount: "" }] } : r));
                        }}><Plus className="h-2.5 w-2.5" /> Item</Button>
                      </div>
                      {row.breakdownItems.length > 0 ? row.breakdownItems.map((bi, biIdx) => (
                        <div key={biIdx} className="flex items-center gap-2">
                          <Input className="flex-1 h-7 text-xs" placeholder="Item name" value={bi.item_name}
                            onChange={e => {
                              setEditGroupSubFees(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.map((b, j) => j === biIdx ? { ...b, item_name: e.target.value } : b) } : r));
                            }} />
                          <Input className="w-[80px] h-7 text-xs" type="number" placeholder="RM" value={bi.amount}
                            onChange={e => {
                              setEditGroupSubFees(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.map((b, j) => j === biIdx ? { ...b, amount: e.target.value } : b) } : r));
                            }} />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => {
                            setEditGroupSubFees(prev => prev.map((r, i) => i === idx ? { ...r, breakdownItems: r.breakdownItems.filter((_, j) => j !== biIdx) } : r));
                          }}><X className="h-2.5 w-2.5" /></Button>
                        </div>
                      )) : (
                        <p className="text-[10px] text-muted-foreground text-center py-1">No items yet</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {activeEditSubFees.length < MAX_SUB_FEES && (
              <div className="flex items-center gap-2 flex-wrap">
                {showExistingPicker ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Select onValueChange={(pkgId) => {
                      const pkg = ungrouped.find((fp: any) => fp.id === pkgId);
                      if (pkg) {
                        const items = allBreakdownItems?.filter((bi: any) => bi.fee_package_id === pkg.id) ?? [];
                        setEditGroupSubFees(prev => [...prev, {
                          id: pkg.id, name: pkg.name, fee_type: pkg.fee_type,
                          amount: String(pkg.amount), description: pkg.description || "",
                          breakdownItems: items.map((bi: any) => ({ id: bi.id, item_name: bi.item_name, amount: String(bi.amount) })),
                          _isExisting: true,
                        }]);
                        setShowExistingPicker(false);
                      }
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select an existing package..." /></SelectTrigger>
                      <SelectContent>
                        {ungrouped.filter((fp: any) => fp.is_active !== false && !editGroupSubFees.some(sf => sf.id === fp.id && !sf._deleted)).map((fp: any) => (
                          <SelectItem key={fp.id} value={fp.id}>{fp.name} — {rm(fp.amount)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => setShowExistingPicker(false)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" className="gap-2 text-xs" onClick={() => setShowExistingPicker(true)}>
                      <Package className="h-3.5 w-3.5" /> Add Existing
                    </Button>
                    <Button variant="outline" className="gap-2 text-xs" onClick={() => {
                      setEditGroupSubFees(prev => [...prev, { name: "", fee_type: "monthly", amount: "", description: "", breakdownItems: [] }]);
                    }}>
                      <Plus className="h-3.5 w-3.5" /> New Sub-Fee
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)}>Cancel</Button>
            <Button onClick={() => editGroupMutation.mutate()} disabled={!editGroupName || editGroupMutation.isPending}>
              {editGroupMutation.isPending ? "Saving…" : "Save Bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Multi-Assign Dialog ── */}
      <Dialog open={showMultiAssign} onOpenChange={o => { if (!o) { setShowMultiAssign(false); setMultiAssignStudent(""); setMultiAssignEntries([]); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Assign Fees to Student</DialogTitle>
            <DialogDescription>Select a student, choose packages, and set per-package discounts</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">Student</Label>
              <Select value={multiAssignStudent} onValueChange={setMultiAssignStudent}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {Array.from(studentsByClass.entries()).map(([cls, list]) => (
                    <div key={cls}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{cls}</div>
                      {list?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Currently assigned fees for selected student */}
            {multiAssignStudent && (() => {
              const currentFees = studentFees?.filter((sf: any) => sf.student_id === multiAssignStudent) ?? [];
              const assignedPkgIds = new Set(currentFees.map((sf: any) => sf.fee_package_id));
              return (
                <>
                  {currentFees.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> Currently Assigned ({currentFees.length})
                      </p>
                      <div className="space-y-1">
                        {currentFees.map((sf: any) => (
                          <div key={sf.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-background">
                            <span className="font-medium">{sf.fee_packages?.name ?? "Unknown"}</span>
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[10px] ${feeTypeBadge[sf.fee_packages?.fee_type] || ""}`}>
                                {feeTypeLabel[sf.fee_packages?.fee_type] || sf.fee_packages?.fee_type}
                              </Badge>
                              <span className="text-sm font-semibold">{rm(sf.fee_packages?.amount ?? 0)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 px-3 pb-1 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className="w-5" />
                      <span className="flex-1">Package</span>
                      <span className="w-20 text-right">Amount</span>
                      <span className="w-[180px] text-center">Discount</span>
                      <span className="w-20 text-right">Net</span>
                    </div>

                    {multiAssignEntries.map(entry => {
                      const fp = packagesWithMeta.find(p => p.id === entry.packageId);
                      if (!fp) return null;
                      const isAlreadyAssigned = assignedPkgIds.has(fp.id);
                      const discAmt = calcDiscountRM(entry.discountType, entry.discountValue, fp.amount);
                      const netAmt = fp.amount - discAmt;
                      return (
                        <div key={fp.id} className={`flex items-center gap-3 border rounded-lg p-3 ${isAlreadyAssigned ? "opacity-50 bg-muted/20" : ""}`}>
                          <Checkbox
                            checked={entry.selected}
                            disabled={isAlreadyAssigned}
                            onCheckedChange={(checked) => {
                              if (isAlreadyAssigned) return;
                              setMultiAssignEntries(prev => prev.map(e => e.packageId === fp.id ? { ...e, selected: !!checked } : e));
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{fp.name}</span>
                            <Badge className={`ml-2 text-[10px] ${feeTypeBadge[fp.fee_type] || ""}`}>{feeTypeLabel[fp.fee_type] || fp.fee_type?.replace("_", " ")}</Badge>
                            {isAlreadyAssigned && <Badge variant="secondary" className="ml-2 text-[10px]">Already assigned</Badge>}
                          </div>
                          <span className="text-sm font-medium w-20 text-right">{rm(fp.amount)}</span>
                          {entry.selected && !isAlreadyAssigned ? (
                            <>
                              <div className="w-[180px]">
                                {discountInput(
                                  entry.discountType,
                                  (t) => setMultiAssignEntries(prev => prev.map(e => e.packageId === fp.id ? { ...e, discountType: t } : e)),
                                  entry.discountValue,
                                  (v) => setMultiAssignEntries(prev => prev.map(e => e.packageId === fp.id ? { ...e, discountValue: v } : e)),
                                  fp.amount, true,
                                )}
                              </div>
                              <span className={`text-sm font-semibold w-20 text-right ${discAmt > 0 ? "text-primary" : ""}`}>{rm(netAmt)}</span>
                            </>
                          ) : (
                            <>
                              <span className="w-[180px] text-center text-xs text-muted-foreground">—</span>
                              <span className="w-20 text-right text-xs text-muted-foreground">—</span>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {multiAssignEntries.some(e => e.selected) && (
                      <div className="border-t pt-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Selected:</span>
                          <span className="font-semibold">{multiAssignEntries.filter(e => e.selected).length} package(s)</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold pt-1 border-t">
                          <span>Net total:</span>
                          <span className="text-primary">{rm(multiAssignEntries.filter(e => e.selected).reduce((s, e) => {
                            const pkg = feePackages?.find((fp: any) => fp.id === e.packageId);
                            const amt = pkg?.amount ?? 0;
                            return s + amt - calcDiscountRM(e.discountType, e.discountValue, amt);
                          }, 0))}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMultiAssign(false)}>Cancel</Button>
            <Button onClick={() => multiAssignMutation.mutate()} disabled={!multiAssignStudent || !multiAssignEntries.some(e => e.selected) || multiAssignMutation.isPending}>
              {multiAssignMutation.isPending ? "Assigning…" : `Assign ${multiAssignEntries.filter(e => e.selected).length} Package(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Assign by Class ── */}
      <Dialog open={!!bulkAssignPkg} onOpenChange={o => { if (!o) { setBulkAssignPkg(null); setBulkClass(""); setBulkDiscount(""); setBulkDiscountType("fixed"); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Assign by Class</DialogTitle><DialogDescription>Assign &quot;{bulkAssignPkg?.name}&quot; ({rm(bulkAssignPkg?.amount ?? 0)}) to all students in a class</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={bulkClass} onValueChange={setBulkClass}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classNames.map(c => <SelectItem key={c} value={c}>{c} ({studentsByClass.get(c)?.length ?? 0} students)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discount per student</Label>
              {discountInput(bulkDiscountType, setBulkDiscountType, bulkDiscount, setBulkDiscount, bulkAssignPkg?.amount)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignPkg(null)}>Cancel</Button>
            <Button onClick={() => bulkAssignMutation.mutate()} disabled={!bulkClass || bulkAssignMutation.isPending}>
              {bulkAssignMutation.isPending ? "Assigning…" : `Assign to ${studentsByClass.get(bulkClass)?.length ?? 0} Students`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Force Delete ── */}
      <AlertDialog open={!!forceDeletePkg} onOpenChange={o => { if (!o) setForceDeletePkg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Package Has Dependencies</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{forceDeletePkg?.name}&quot; has active assignments or invoice items. Force delete will deactivate all linked assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => { togglePkgActive.mutate({ id: forceDeletePkg.id, is_active: false }); setForceDeletePkg(null); }}>
              Just Archive
            </Button>
            <AlertDialogAction onClick={() => forceDeleteMutation.mutate(forceDeletePkg)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Force Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Version History ── */}
      {versionHistoryPkg && (
        <FeeVersionHistory
          packageId={versionHistoryPkg.id}
          packageName={versionHistoryPkg.name}
          branchId={branchId}
          canManage={canManage}
          open={!!versionHistoryPkg}
          onOpenChange={(open) => { if (!open) setVersionHistoryPkg(null); }}
        />
      )}
    </div>
  );
}
