import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Building2, Pencil, Trash2, MapPin, Phone, Mail, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Organization = Tables<"organizations">;
type Branch = Tables<"branches">;

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: "", email: "", phone: "", address: "", max_capacity: "50" });

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Organization;
    },
    enabled: !!id,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["org-branches", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").eq("organization_id", id!).order("name");
      if (error) throw error;
      return data as Branch[];
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Organization>) => {
      const { error } = await supabase.from("organizations").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", id] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setEditing(false);
      toast({ title: "Organization updated" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("organizations").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      navigate("/organizations");
      toast({ title: "Organization deleted" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createBranchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("branches").insert({
        name: branchForm.name,
        organization_id: id!,
        email: branchForm.email || null,
        phone: branchForm.phone || null,
        address: branchForm.address || null,
        max_capacity: parseInt(branchForm.max_capacity) || 50,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["org-branches", id] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      queryClient.invalidateQueries({ queryKey: ["branch-counts"] });
      setBranchDialogOpen(false);
      setBranchForm({ name: "", email: "", phone: "", address: "", max_capacity: "50" });
      toast({ title: "Branch created", description: "Next: assign staff to this branch." });
      if (data?.id) navigate(`/branches/${data.id}`);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = () => {
    if (org) setForm({ name: org.name, email: org.email || "", phone: org.phone || "", address: org.address || "" });
    setEditing(true);
  };

  if (isLoading) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Loading...</div></DashboardLayout>;
  if (!org) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Organization not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/organizations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
            <p className="text-sm text-muted-foreground">Organization details</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Delete</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete {org.name} and cannot be undone. All branches under this organization must be removed first.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {editing ? (
          <Card>
            <CardHeader><CardTitle>Edit Organization</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate({ name: form.name, email: form.email || null, phone: form.phone || null, address: form.address || null })} disabled={!form.name || updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {org.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{org.email}</p>}
                {org.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{org.phone}</p>}
                {org.address && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{org.address}</p>}
                {!org.email && !org.phone && !org.address && <p className="text-muted-foreground">No contact details added yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Branches</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{branches.length}</Badge>
                  <Button size="sm" className="h-7 text-xs" onClick={() => setBranchDialogOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />Add Branch
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {branches.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                    No branches yet. Click <strong>Add Branch</strong> to create your first one.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {branches.map((b) => (
                      <button key={b.id} onClick={() => navigate(`/branches/${b.id}`)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/50 transition-colors">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                          {b.address && <p className="text-xs text-muted-foreground truncate">{b.address}</p>}
                        </div>
                        <Badge variant={b.is_active ? "secondary" : "outline"} className="text-[10px]">
                          {b.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Branch under {org.name}</DialogTitle>
            <DialogDescription>Step 2 of 3 — create a branch, then assign staff.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Branch Name *</Label><Input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="e.g. KL Central" /></div>
            <div><Label>Email</Label><Input type="email" value={branchForm.email} onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} /></div>
            <div><Label>Address</Label><Input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></div>
            <div><Label>Max Capacity</Label><Input type="number" value={branchForm.max_capacity} onChange={(e) => setBranchForm({ ...branchForm, max_capacity: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createBranchMutation.mutate()} disabled={!branchForm.name || createBranchMutation.isPending}>
              {createBranchMutation.isPending ? "Creating..." : "Create & Assign Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
