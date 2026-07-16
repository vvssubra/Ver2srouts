import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Layers, Plus, Pencil, Trash2, BookOpen } from "lucide-react";

const DOMAIN_COLORS = [
  "bg-blue-50 border-blue-200 text-blue-800",
  "bg-emerald-50 border-emerald-200 text-emerald-800",
  "bg-purple-50 border-purple-200 text-purple-800",
  "bg-orange-50 border-orange-200 text-orange-800",
  "bg-pink-50 border-pink-200 text-pink-800",
  "bg-yellow-50 border-yellow-200 text-yellow-800",
  "bg-teal-50 border-teal-200 text-teal-800",
];

export default function DevelopmentDomains() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";

  const [editDomain, setEditDomain] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSort, setFormSort] = useState(0);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["development-domains"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("*").order("sort_order");
      return data ?? [];
    },
  });

  const { data: outcomeCounts = {} } = useQuery({
    queryKey: ["domain-outcome-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("development_outcomes").select("domain_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((o: any) => {
        counts[o.domain_id] = (counts[o.domain_id] || 0) + 1;
      });
      return counts;
    },
  });

  const openEdit = (d: any) => {
    setEditDomain(d);
    setFormName(d.name);
    setFormCode(d.code);
    setFormDescription(d.description || "");
    setFormSort(d.sort_order);
  };

  const openCreate = () => {
    setShowCreate(true);
    setFormName("");
    setFormCode("");
    setFormDescription("");
    setFormSort((domains as any[]).length + 1);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: formName, code: formCode, description: formDescription, sort_order: formSort };
      if (editDomain) {
        const { error } = await supabase.from("development_domains").update(payload as any).eq("id", editDomain.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("development_domains").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["development-domains"] });
      setEditDomain(null);
      setShowCreate(false);
      toast({ title: editDomain ? "Domain updated" : "Domain created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("development_domains").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["development-domains"] });
      toast({ title: "Domain deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const dialogOpen = !!editDomain || showCreate;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Development Domains
            </h1>
            <p className="text-muted-foreground">
              The 7 core curriculum domains that guide child development and learning outcomes.
            </p>
          </div>
          {isSuperAdmin && (
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Domain
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : domains.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No domains yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Add development domains to build your curriculum framework.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(domains as any[]).map((d: any, i: number) => {
              const colorClass = DOMAIN_COLORS[i % DOMAIN_COLORS.length];
              const count = (outcomeCounts as Record<string, number>)[d.id] || 0;
              return (
                <Card key={d.id} className={`border-2 transition-shadow hover:shadow-md ${colorClass.split(" ").slice(0, 2).join(" ")}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 shrink-0" />
                        <CardTitle className="text-base leading-snug">{d.name}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{d.code}</Badge>
                    </div>
                    {d.description && (
                      <CardDescription className="text-xs mt-2 line-clamp-3">{d.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{count} outcomes</span>
                      {isSuperAdmin && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditDomain(null); setShowCreate(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDomain ? "Edit Domain" : "Add Domain"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Communication & Language" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="e.g. CL" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input type="number" value={formSort} onChange={(e) => setFormSort(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDomain(null); setShowCreate(false); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formName || !formCode}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
