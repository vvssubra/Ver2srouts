import { useMemo, useState, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getRoleLabel } from "@/lib/auth";
import { Loader2, Download, Workflow, Users, Info, UsersRound, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toPng } from "html-to-image";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type StaffNodeData = {
  name: string;
  email: string;
  role: string;
  designation: string | null;
  branches: string[];
  highlighted?: boolean;
};

function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const DESIGNATION_LABELS: Record<string, string> = {
  administrator: "Administrator",
  assistant_teacher: "Assistant Teacher",
  teacher: "Teacher",
  senior_teacher: "Senior Teacher",
  assistant_principal: "Assistant Principal",
  principal: "Principal",
  bud: "Business Unit Development (BUD)",
  finance_manager: "Finance Manager",
};

function designationLabel(value: string | null | undefined): string {
  if (!value) return "";
  return DESIGNATION_LABELS[value] ?? humanize(value);
}

function StaffNode({ data, selected }: NodeProps) {
  const d = data as StaffNodeData;
  const desigText = d.designation ? designationLabel(d.designation) : getRoleLabel(d.role as any);
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm px-4 py-3 min-w-[220px] transition-all ${
        selected ? "ring-2 ring-primary border-primary" : "border-border"
      } ${d.highlighted ? "ring-2 ring-warning" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <div className="flex items-start gap-2">
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
          {d.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{d.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">{desigText}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{getRoleLabel(d.role as any)}</Badge>
            {d.branches.slice(0, 2).map((b) => (
              <Badge key={b} variant="outline" className="text-[9px] px-1.5 py-0">{b}</Badge>
            ))}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
}

const nodeTypes = { staff: StaffNode };

const WORKFLOWS = [
  { key: "leave", label: "Leave" },
  { key: "ot", label: "Overtime" },
  { key: "claim", label: "Claims" },
  { key: "payroll", label: "Payroll" },
  { key: "attendance", label: "Attendance Correction" },
] as const;

/** Layered tree layout: root(s) at top, children below. */
function layoutTree(staff: any[], reportsToMap: Map<string, string | null>) {
  const childrenMap = new Map<string | null, string[]>();
  staff.forEach((s) => {
    const p = reportsToMap.get(s.id) ?? null;
    const arr = childrenMap.get(p) ?? [];
    arr.push(s.id);
    childrenMap.set(p, arr);
  });

  const positions = new Map<string, { x: number; y: number }>();
  const X_GAP = 260;
  const Y_GAP = 140;

  let nextX = 0;
  const placeSubtree = (id: string, depth: number): number => {
    const kids = childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      const x = nextX * X_GAP;
      nextX += 1;
      positions.set(id, { x, y: depth * Y_GAP });
      return x;
    }
    const childXs = kids.map((k) => placeSubtree(k, depth + 1));
    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    positions.set(id, { x, y: depth * Y_GAP });
    return x;
  };

  const roots = childrenMap.get(null) ?? [];
  // Orphans (have reports_to pointing to someone outside list) also become roots
  staff.forEach((s) => {
    const rt = reportsToMap.get(s.id) ?? null;
    if (rt && !staff.find((x) => x.id === rt)) {
      if (!roots.includes(s.id)) roots.push(s.id);
    }
  });
  roots.forEach((r) => placeSubtree(r, 0));
  // Anyone not yet placed (cycles): place at depth 0 trailing
  staff.forEach((s) => {
    if (!positions.has(s.id)) {
      positions.set(s.id, { x: nextX * X_GAP, y: 0 });
      nextX += 1;
    }
  });

  return positions;
}

function OrgChartInner() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { selectedBranchId, branches } = useGlobalBranch();
  const branchLabel =
    !selectedBranchId || selectedBranchId === "all"
      ? "All Branches"
      : branches.find((b) => b.id === selectedBranchId)?.name ?? "";
  const canEdit = role === "super_admin" || role === "franchisee" || role === "admin";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { getNode } = useReactFlow();

  const layoutStorageKey = `org-chart-layout:${selectedBranchId || "all"}`;
  const loadSavedPositions = (): Record<string, { x: number; y: number }> => {
    try {
      const raw = localStorage.getItem(layoutStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const savePositions = (nodesList: Node[]) => {
    try {
      const map: Record<string, { x: number; y: number }> = {};
      nodesList.forEach((n) => {
        map[n.id] = { x: n.position.x, y: n.position.y };
      });
      localStorage.setItem(layoutStorageKey, JSON.stringify(map));
    } catch {}
  };

  // Fetch staff in scope
  const { data: staffData = [], isLoading } = useQuery({
    queryKey: ["org-chart-staff", selectedBranchId],
    queryFn: async () => {
      // 1. Memberships in scope
      let memQ = supabase.from("branch_memberships").select("user_id, branch_id, branches(name)");
      if (selectedBranchId && selectedBranchId !== "all") memQ = memQ.eq("branch_id", selectedBranchId);
      const { data: mems } = await memQ;

      const userIds = Array.from(new Set((mems ?? []).map((m: any) => m.user_id)));
      if (userIds.length === 0) return [];

      const [profilesRes, rolesRes, spRes, desigRes] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("staff_profiles").select("user_id, reports_to, employment_status").in("user_id", userIds),
        supabase.from("staff_designations").select("user_id, designation, custom_designation").in("user_id", userIds),
      ]);

      const branchesByUser = new Map<string, string[]>();
      (mems ?? []).forEach((m: any) => {
        const arr = branchesByUser.get(m.user_id) ?? [];
        if (m.branches?.name) arr.push(m.branches.name);
        branchesByUser.set(m.user_id, arr);
      });
      const roleByUser = new Map<string, string>();
      (rolesRes.data ?? []).forEach((r: any) => {
        const cur = roleByUser.get(r.user_id);
        if (!cur || cur === "parent") roleByUser.set(r.user_id, r.role);
      });
      const spByUser = new Map<string, any>();
      (spRes.data ?? []).forEach((s: any) => spByUser.set(s.user_id, s));
      const desigByUser = new Map<string, any>();
      (desigRes.data ?? []).forEach((d: any) => desigByUser.set(d.user_id, d));

      return (profilesRes.data ?? [])
        .filter((p: any) => {
          const r = roleByUser.get(p.id);
          if (!r || r === "parent") return false;
          const sp = spByUser.get(p.id);
          return !sp || !["resigned", "terminated"].includes(sp.employment_status);
        })
        .map((p: any) => {
          const d = desigByUser.get(p.id);
          const desigLabel = d?.designation === "other" ? d.custom_designation : d?.designation;
          return {
            id: p.id,
            name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email,
            email: p.email,
            role: roleByUser.get(p.id) || "staff",
            designation: desigLabel ?? null,
            reports_to: spByUser.get(p.id)?.reports_to ?? null,
            branches: branchesByUser.get(p.id) ?? [],
          };
        });
    },
  });

  // Build nodes/edges
  const { initialNodes, initialEdges } = useMemo(() => {
    const reportsToMap = new Map<string, string | null>();
    staffData.forEach((s: any) => reportsToMap.set(s.id, s.reports_to));
    const computed = layoutTree(staffData, reportsToMap);
    const saved = loadSavedPositions();
    const positions = new Map<string, { x: number; y: number }>();
    staffData.forEach((s: any) => {
      positions.set(s.id, saved[s.id] ?? computed.get(s.id) ?? { x: 0, y: 0 });
    });
    const nodes: Node[] = staffData.map((s: any) => ({
      id: s.id,
      type: "staff",
      position: positions.get(s.id) ?? { x: 0, y: 0 },
      data: {
        name: s.name,
        email: s.email,
        role: s.role,
        designation: s.designation,
        branches: s.branches,
      } as StaffNodeData,
    }));
    const edges: Edge[] = staffData
      .filter((s: any) => s.reports_to && staffData.find((x: any) => x.id === s.reports_to))
      .map((s: any) => ({
        id: `${s.reports_to}-${s.id}`,
        source: s.reports_to,
        target: s.id,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5 },
      }));
    return { initialNodes: nodes, initialEdges: edges };
  }, [staffData, layoutStorageKey]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const setReportsToMutation = useMutation({
    mutationFn: async ({ userId, reportsTo }: { userId: string; reportsTo: string | null }) => {
      const { error } = await supabase
        .from("staff_profiles")
        .upsert({ user_id: userId, reports_to: reportsTo } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Reporting line updated" });
      queryClient.invalidateQueries({ queryKey: ["org-chart-staff"] });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  // Drag staff onto another staff = set reports_to
  const handleNodeDragStop = useCallback(
    (_evt: any, node: Node) => {
      // Always persist new position regardless of edit permission
      const updated = nodes.map((n) => (n.id === node.id ? { ...n, position: node.position } : n));
      savePositions(updated);
      if (!canEdit) return;
      // Find the node we were dropped onto (closest other node by distance)
      const candidates = nodes.filter((n) => n.id !== node.id);
      let target: Node | null = null;
      let bestDist = Infinity;
      candidates.forEach((c) => {
        const cx = (c.position.x + 110) - (node.position.x + 110);
        const cy = (c.position.y + 50) - (node.position.y + 50);
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d < bestDist && d < 130) {
          bestDist = d;
          target = c;
        }
      });
      if (target) {
        const targetNode = target as Node;
        setReportsToMutation.mutate({ userId: node.id, reportsTo: targetNode.id });
      }
    },
    [nodes, canEdit, setReportsToMutation, layoutStorageKey]
  );

  const handleExportPng = async () => {
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!viewport) return;
    try {
      // Render viewport then composite a title bar with the branch name on top.
      const innerUrl = await toPng(viewport, { backgroundColor: "#ffffff", cacheBust: true });
      const innerImg = new Image();
      innerImg.src = innerUrl;
      await new Promise((res, rej) => {
        innerImg.onload = res;
        innerImg.onerror = rej;
      });
      const HEADER_H = 90;
      const canvas = document.createElement("canvas");
      canvas.width = innerImg.width;
      canvas.height = innerImg.height + HEADER_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(innerImg, 0, HEADER_H);
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 28px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`Organization Chart — ${branchLabel}`, 32, HEADER_H / 2 - 4);
      ctx.fillStyle = "#64748b";
      ctx.font = "400 14px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(
        `Generated ${new Date().toLocaleDateString()}`,
        32,
        HEADER_H / 2 + 22
      );
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeBranch = branchLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      link.download = `org-chart-${safeBranch}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const selectedStaff = selectedNodeId ? staffData.find((s: any) => s.id === selectedNodeId) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5" /> Organization Chart
                {branchLabel && (
                  <span className="text-muted-foreground font-normal">— {branchLabel}</span>
                )}
              </CardTitle>
              <CardDescription>
                Visualize reporting lines. {canEdit && "Drag a staff card onto another staff to set who they report to."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                  <UsersRound className="h-4 w-4 mr-1" /> Bulk Set Approvers
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportPng}>
                <Download className="h-4 w-4 mr-1" /> Export PNG
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 mb-3">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Click a staff card to view their approval &amp; notification routing for Leave, OT, Claims, Payroll &amp; Attendance.
          </div>
          <div style={{ height: 600 }} className="rounded-lg border bg-background">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : staffData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Users className="h-8 w-8" />
                <p className="text-sm">No staff in scope.</p>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                nodeTypes={nodeTypes}
                fitView
                nodesDraggable={canEdit}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} />
                <Controls />
                <MiniMap pannable zoomable nodeColor="hsl(var(--primary))" />
              </ReactFlow>
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selectedNodeId} onOpenChange={(o) => !o && setSelectedNodeId(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedStaff && (
            <ApprovalMatrixPanel staff={selectedStaff} allStaff={staffData} canEdit={canEdit} />
          )}
        </SheetContent>
      </Sheet>

      <BulkApproversDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        allStaff={staffData}
      />
    </div>
  );
}

function ApprovalMatrixPanel({
  staff,
  allStaff,
  canEdit,
}: {
  staff: any;
  allStaff: any[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: routing = [] } = useQuery({
    queryKey: ["approval-routing", staff.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("approval_routing" as any)
        .select("*")
        .eq("user_id", staff.id);
      return (data ?? []) as any[];
    },
  });

  const byWorkflow = new Map<string, any>();
  routing.forEach((r: any) => byWorkflow.set(r.workflow, r));

  const saveMutation = useMutation({
    mutationFn: async ({
      workflow,
      l1,
      l2,
      l2Disabled,
    }: {
      workflow: string;
      l1: string | null;
      l2: string | null;
      l2Disabled: boolean;
    }) => {
      const existing = byWorkflow.get(workflow);
      const payload: any = {
        user_id: staff.id,
        workflow,
        l1_approver_id: l1,
        l2_approver_id: l2Disabled ? null : l2,
        l2_disabled: l2Disabled,
      };
      if (existing) {
        const { error } = await supabase
          .from("approval_routing" as any)
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("approval_routing" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-routing", staff.id] });
      toast({ title: "Approval routing updated" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const reportsToMutation = useMutation({
    mutationFn: async (newReportsTo: string | null) => {
      const { error } = await supabase
        .from("staff_profiles")
        .upsert({ user_id: staff.id, reports_to: newReportsTo } as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Reporting line updated" });
      queryClient.invalidateQueries({ queryKey: ["org-chart-staff"] });
    },
    onError: (e: any) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const desigText = staff.designation ? designationLabel(staff.designation) : getRoleLabel(staff.role as any);
  const currentReportsTo = staff.reports_to ?? "__none__";

  return (
    <>
      <SheetHeader>
        <SheetTitle>{staff.name}</SheetTitle>
        <SheetDescription>
          {desigText}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <Label className="text-sm font-semibold">Reports To</Label>
          <Select
            value={currentReportsTo}
            onValueChange={(v) => reportsToMutation.mutate(v === "__none__" ? null : v)}
            disabled={!canEdit || reportsToMutation.isPending}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Top of chain (no manager)</SelectItem>
              {allStaff
                .filter((s) => s.id !== staff.id)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Tip: you can also drag a staff card onto another in the chart to set this.
          </p>
        </div>
        <Separator />
        <div className="text-xs text-muted-foreground">
          Per-workflow approvers. Leave blank to use the default precedence:
          <span className="text-foreground font-medium"> Reports-To → Branch Manager → Super Admin</span>.
        </div>
        <Separator />
        {WORKFLOWS.map(({ key, label }) => {
          const r = byWorkflow.get(key);
          return (
            <WorkflowRow
              key={key}
              label={label}
              workflow={key}
              l1={r?.l1_approver_id ?? null}
              l2={r?.l2_approver_id ?? null}
              l2Disabled={r?.l2_disabled ?? false}
              allStaff={allStaff.filter((s) => s.id !== staff.id)}
              canEdit={canEdit}
              onSave={(l1, l2, l2Disabled) =>
                saveMutation.mutate({ workflow: key, l1, l2, l2Disabled })
              }
              pending={saveMutation.isPending}
            />
          );
        })}
      </div>
    </>
  );
}

function WorkflowRow({
  label,
  workflow,
  l1,
  l2,
  l2Disabled,
  allStaff,
  canEdit,
  onSave,
  pending,
}: {
  label: string;
  workflow: string;
  l1: string | null;
  l2: string | null;
  l2Disabled: boolean;
  allStaff: any[];
  canEdit: boolean;
  onSave: (l1: string | null, l2: string | null, l2Disabled: boolean) => void;
  pending: boolean;
}) {
  const [v1, setV1] = useState<string>(l1 ?? "__default__");
  const [v2, setV2] = useState<string>(l2Disabled ? "__none__" : (l2 ?? "__default__"));

  useEffect(() => {
    setV1(l1 ?? "__default__");
    setV2(l2Disabled ? "__none__" : (l2 ?? "__default__"));
  }, [l1, l2, l2Disabled]);

  const nextL1 = v1 === "__default__" ? null : v1;
  const nextL2Disabled = v2 === "__none__";
  const nextL2 = nextL2Disabled || v2 === "__default__" ? null : v2;
  const dirty = nextL1 !== l1 || nextL2 !== l2 || nextL2Disabled !== l2Disabled;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        {dirty && canEdit && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onSave(nextL1, nextL2, nextL2Disabled)}
          >
            Save
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">L1 Approver</Label>
          <Select value={v1} onValueChange={setV1} disabled={!canEdit}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Default (Reports-To)</SelectItem>
              {allStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">L2 Approver</Label>
          <Select value={v2} onValueChange={setV2} disabled={!canEdit}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Default (Branch Manager)</SelectItem>
              <SelectItem value="__none__">None (no second approver)</SelectItem>
              {allStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function OrgChart({ embedded = false }: { embedded?: boolean } = {}) {
  const content = (
    <ReactFlowProvider>
      <OrgChartInner />
    </ReactFlowProvider>
  );
  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}

function BulkApproversDialog({
  open,
  onOpenChange,
  allStaff,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  allStaff: any[];
}) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [workflow, setWorkflow] = useState<string>("leave");
  const [l1, setL1] = useState<string>("__keep__");
  const [l2, setL2] = useState<string>("__keep__");

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSearch("");
      setL1("__keep__");
      setL2("__keep__");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStaff;
    return allStaff.filter((s) => s.name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q));
  }, [allStaff, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((s) => next.delete(s.id));
      } else {
        filtered.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error("Select at least one staff member");
      // Fetch existing rows for these users + workflow
      const { data: existing } = await supabase
        .from("approval_routing" as any)
        .select("id, user_id, l1_approver_id, l2_approver_id, l2_disabled")
        .in("user_id", ids)
        .eq("workflow", workflow);
      const existingByUser = new Map<string, any>();
      (existing ?? []).forEach((r: any) => existingByUser.set(r.user_id, r));

      for (const uid of ids) {
        const cur = existingByUser.get(uid);
        const nextL1 =
          l1 === "__keep__" ? cur?.l1_approver_id ?? null : l1 === "__default__" ? null : l1;
        const nextL2Disabled =
          l2 === "__keep__" ? cur?.l2_disabled ?? false : l2 === "__none__";
        const nextL2 =
          l2 === "__keep__"
            ? cur?.l2_approver_id ?? null
            : nextL2Disabled || l2 === "__default__"
            ? null
            : l2;
        const payload: any = {
          user_id: uid,
          workflow,
          l1_approver_id: nextL1,
          l2_approver_id: nextL2,
          l2_disabled: nextL2Disabled,
        };
        if (cur) {
          const { error } = await supabase
            .from("approval_routing" as any)
            .update(payload)
            .eq("id", cur.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("approval_routing" as any).insert(payload);
          if (error) throw error;
        }
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast({ title: `Updated approvers for ${count} staff` });
      queryClient.invalidateQueries({ queryKey: ["approval-routing"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Bulk update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Set Approvers</DialogTitle>
          <DialogDescription>
            Pick a workflow and set L1/L2 approvers for multiple staff at once. Choose "Keep current" to leave a level unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Workflow</Label>
              <Select value={workflow} onValueChange={setWorkflow}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKFLOWS.map((w) => (
                    <SelectItem key={w.key} value={w.key}>{w.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">L1 Approver</Label>
              <Select value={l1} onValueChange={setL1}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current</SelectItem>
                  <SelectItem value="__default__">Default (Reports-To)</SelectItem>
                  {allStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">L2 Approver</Label>
              <Select value={l2} onValueChange={setL2}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current</SelectItem>
                  <SelectItem value="__default__">Default (Branch Manager)</SelectItem>
                  <SelectItem value="__none__">None (no second approver)</SelectItem>
                  {allStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button type="button" onClick={toggleAll} className="text-primary hover:underline">
                {allFilteredSelected ? "Deselect all" : "Select all"} ({filtered.length})
              </button>
              <span>{selectedIds.size} selected</span>
            </div>
            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {filtered.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedIds.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.designation ? designationLabel(s.designation) : getRoleLabel(s.role as any)}
                    </div>
                  </div>
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No staff found.</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={selectedIds.size === 0 || applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? "Saving..." : `Apply to ${selectedIds.size} staff`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}