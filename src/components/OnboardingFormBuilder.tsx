import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical, Loader2, Users, UserCog } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STAFF_STEPS = ["Personal Details", "Emergency Contact", "Bank & Statutory", "Documents"];
const PARENT_STEPS = ["My Details", "Child Safety", "PDPA Consent"];
const FIELD_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "file", label: "File Upload" },
];

interface FieldForm {
  id?: string;
  field_label: string;
  field_type: string;
  step_label: string;
  is_required: boolean;
  options: string[];
}

const emptyField: FieldForm = {
  field_label: "",
  field_type: "text",
  step_label: "",
  is_required: false,
  options: [],
};

export default function OnboardingFormBuilder() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formType, setFormType] = useState<"staff" | "parent">("staff");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editField, setEditField] = useState<FieldForm>(emptyField);
  const [optionInput, setOptionInput] = useState("");

  // Get user's branch
  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const branchId = membership?.branch_id;
  const steps = formType === "staff" ? STAFF_STEPS : PARENT_STEPS;

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["onboarding-form-fields", branchId, formType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_form_fields")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("form_type", formType)
        .order("step_label")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const saveMutation = useMutation({
    mutationFn: async (field: FieldForm) => {
      const payload = {
        branch_id: branchId!,
        form_type: formType,
        step_label: field.step_label,
        field_label: field.field_label,
        field_type: field.field_type,
        is_required: field.is_required,
        options: field.options,
        sort_order: field.id ? undefined : (fields.filter((f: any) => f.step_label === field.step_label).length),
      };

      if (field.id) {
        const { error } = await supabase
          .from("onboarding_form_fields")
          .update(payload as any)
          .eq("id", field.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("onboarding_form_fields")
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-form-fields"] });
      setDialogOpen(false);
      setEditField(emptyField);
      toast({ title: "Field saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase.from("onboarding_form_fields").delete().eq("id", fieldId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-form-fields"] });
      toast({ title: "Field deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("onboarding_form_fields")
        .update({ is_active } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-form-fields"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditField({ ...emptyField, step_label: steps[0] });
    setDialogOpen(true);
  };

  const openEdit = (field: any) => {
    setEditField({
      id: field.id,
      field_label: field.field_label,
      field_type: field.field_type,
      step_label: field.step_label,
      is_required: field.is_required,
      options: Array.isArray(field.options) ? field.options : [],
    });
    setDialogOpen(true);
  };

  const addOption = () => {
    if (optionInput.trim()) {
      setEditField((p) => ({ ...p, options: [...p.options, optionInput.trim()] }));
      setOptionInput("");
    }
  };

  const removeOption = (idx: number) => {
    setEditField((p) => ({ ...p, options: p.options.filter((_, i) => i !== idx) }));
  };

  // Group fields by step
  const groupedFields: Record<string, any[]> = {};
  steps.forEach((s) => { groupedFields[s] = []; });
  fields.forEach((f: any) => {
    if (groupedFields[f.step_label]) groupedFields[f.step_label].push(f);
    else groupedFields[f.step_label] = [f];
  });

  if (!branchId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No branch assigned. Please contact your administrator.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Onboarding Form Builder</CardTitle>
              <CardDescription>Customize onboarding questions for staff and parents</CardDescription>
            </div>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={formType} onValueChange={(v) => setFormType(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="staff"><UserCog className="h-4 w-4 mr-1" /> Staff Form</TabsTrigger>
              <TabsTrigger value="parent"><Users className="h-4 w-4 mr-1" /> Parent Form</TabsTrigger>
            </TabsList>

            <TabsContent value={formType}>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-6">
                  {steps.map((stepName) => {
                    const stepFields = groupedFields[stepName] ?? [];
                    return (
                      <div key={stepName} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{stepName}</h3>
                          <Badge variant="secondary" className="text-xs">{stepFields.length} custom</Badge>
                        </div>
                        {stepFields.length === 0 ? (
                          <p className="text-xs text-muted-foreground pl-2">No custom questions added to this step</p>
                        ) : (
                          <div className="space-y-2">
                            {stepFields.map((field: any) => (
                              <div
                                key={field.id}
                                className="flex items-center gap-3 rounded-lg border bg-card p-3"
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{field.field_label}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-xs">{field.field_type}</Badge>
                                    {field.is_required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                                    {!field.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                                  </div>
                                </div>
                                <Switch
                                  checked={field.is_active}
                                  onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: field.id, is_active: checked })}
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(field)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                  onClick={() => {
                                    if (confirm("Delete this question?")) deleteMutation.mutate(field.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editField.id ? "Edit Question" : "Add Question"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question Text *</Label>
              <Input
                value={editField.field_label}
                onChange={(e) => setEditField((p) => ({ ...p, field_label: e.target.value }))}
                placeholder="e.g. Do you have any dietary restrictions?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select value={editField.field_type} onValueChange={(v) => setEditField((p) => ({ ...p, field_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Show In Step</Label>
                <Select value={editField.step_label} onValueChange={(v) => setEditField((p) => ({ ...p, step_label: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {steps.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={editField.is_required}
                onCheckedChange={(c) => setEditField((p) => ({ ...p, is_required: c }))}
              />
              <Label>Required field</Label>
            </div>

            {editField.field_type === "select" && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    placeholder="Add option..."
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={addOption}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {editField.options.map((opt, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {opt}
                      <button onClick={() => removeOption(i)} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(editField)}
              disabled={!editField.field_label.trim() || !editField.step_label || saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
