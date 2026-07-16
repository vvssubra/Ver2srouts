import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Lock,
  Copy,
  MessageCircle,
  ExternalLink,
  Save,
  Eye,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type FieldDef = {
  id: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  options: string[];
  sort_order: number;
  is_default?: boolean;
  is_active: boolean;
};

const DEFAULT_FIELDS: Record<string, FieldDef[]> = {
  interest: [
    { id: "d-parent-name", field_label: "Parent Name", field_type: "text", is_required: true, options: [], sort_order: 0, is_default: true, is_active: true },
    { id: "d-email", field_label: "Email Address", field_type: "text", is_required: true, options: [], sort_order: 1, is_default: true, is_active: true },
    { id: "d-phone", field_label: "Phone Number", field_type: "text", is_required: true, options: [], sort_order: 2, is_default: true, is_active: true },
    { id: "d-child-name", field_label: "Child's Name", field_type: "text", is_required: true, options: [], sort_order: 3, is_default: true, is_active: true },
    { id: "d-child-age", field_label: "Child's Age", field_type: "text", is_required: true, options: [], sort_order: 4, is_default: true, is_active: true },
    { id: "d-interest", field_label: "What are you interested in?", field_type: "textarea", is_required: false, options: [], sort_order: 5, is_default: true, is_active: true },
  ],
  registration: [
    { id: "d-parent-name", field_label: "Parent/Guardian Name", field_type: "text", is_required: true, options: [], sort_order: 0, is_default: true, is_active: true },
    { id: "d-parent-ic", field_label: "Parent IC/Passport No", field_type: "text", is_required: true, options: [], sort_order: 1, is_default: true, is_active: true },
    { id: "d-email", field_label: "Email Address", field_type: "text", is_required: true, options: [], sort_order: 2, is_default: true, is_active: true },
    { id: "d-phone", field_label: "Phone Number", field_type: "text", is_required: true, options: [], sort_order: 3, is_default: true, is_active: true },
    { id: "d-address", field_label: "Home Address", field_type: "textarea", is_required: true, options: [], sort_order: 4, is_default: true, is_active: true },
    { id: "d-child-name", field_label: "Child's Full Name", field_type: "text", is_required: true, options: [], sort_order: 5, is_default: true, is_active: true },
    { id: "d-child-dob", field_label: "Child's Date of Birth", field_type: "date", is_required: true, options: [], sort_order: 6, is_default: true, is_active: true },
    { id: "d-child-gender", field_label: "Child's Gender", field_type: "select", is_required: true, options: ["Male", "Female"], sort_order: 7, is_default: true, is_active: true },
    { id: "d-allergies", field_label: "Allergies / Medical Conditions", field_type: "textarea", is_required: false, options: [], sort_order: 8, is_default: true, is_active: true },
    { id: "d-emergency-contact", field_label: "Emergency Contact Name", field_type: "text", is_required: true, options: [], sort_order: 9, is_default: true, is_active: true },
    { id: "d-emergency-phone", field_label: "Emergency Contact Phone", field_type: "text", is_required: true, options: [], sort_order: 10, is_default: true, is_active: true },
  ],
  parent_onboarding: [
    { id: "d-parent-name", field_label: "Parent/Guardian Name", field_type: "text", is_required: true, options: [], sort_order: 0, is_default: true, is_active: true },
    { id: "d-email", field_label: "Email Address", field_type: "text", is_required: true, options: [], sort_order: 1, is_default: true, is_active: true },
    { id: "d-phone", field_label: "Phone Number", field_type: "text", is_required: true, options: [], sort_order: 2, is_default: true, is_active: true },
    { id: "d-child-name", field_label: "Child's Full Name", field_type: "text", is_required: true, options: [], sort_order: 3, is_default: true, is_active: true },
    { id: "d-child-dob", field_label: "Child's Date of Birth", field_type: "date", is_required: true, options: [], sort_order: 4, is_default: true, is_active: true },
  ],
  staff_onboarding: [
    { id: "d-full-name", field_label: "Full Name (as per IC)", field_type: "text", is_required: true, options: [], sort_order: 0, is_default: true, is_active: true },
    { id: "d-ic", field_label: "IC Number", field_type: "text", is_required: true, options: [], sort_order: 1, is_default: true, is_active: true },
    { id: "d-email", field_label: "Email Address", field_type: "text", is_required: true, options: [], sort_order: 2, is_default: true, is_active: true },
    { id: "d-phone", field_label: "Phone Number", field_type: "text", is_required: true, options: [], sort_order: 3, is_default: true, is_active: true },
    { id: "d-address", field_label: "Home Address", field_type: "textarea", is_required: true, options: [], sort_order: 4, is_default: true, is_active: true },
    { id: "d-bank-name", field_label: "Bank Name", field_type: "text", is_required: true, options: [], sort_order: 5, is_default: true, is_active: true },
    { id: "d-bank-account", field_label: "Bank Account Number", field_type: "text", is_required: true, options: [], sort_order: 6, is_default: true, is_active: true },
  ],
};

const FIELD_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "file", label: "File Upload" },
];

export default function EFormBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editFieldId, setEditFieldId] = useState<string | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Form name editing
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const { data: form } = useQuery({
    queryKey: ["eform", id],
    queryFn: async () => {
      const { data } = await supabase.from("eforms").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (form) {
      setFormName(form.name);
      setFormDesc(form.description || "");
    }
  }, [form]);

  const branchId = form?.branch_id;

  const { data: customFields = [] } = useQuery({
    queryKey: ["eform-custom-fields", branchId, form?.form_type],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_form_fields")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("form_type", form!.form_type === "interest" || form!.form_type === "registration" ? "parent" : form!.form_type === "staff_onboarding" ? "staff" : "parent")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
    enabled: !!branchId && !!form,
  });

  const defaultFields = DEFAULT_FIELDS[form?.form_type || "registration"] || [];
  // Merge: defaults + custom
  const allFields: FieldDef[] = [
    ...defaultFields,
    ...customFields.map((cf: any, i: number) => ({
      id: cf.id,
      field_label: cf.field_label,
      field_type: cf.field_type,
      is_required: cf.is_required,
      options: Array.isArray(cf.options) ? cf.options : [],
      sort_order: defaultFields.length + i,
      is_default: false,
      is_active: cf.is_active,
    })),
  ];

  const updateForm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("eforms")
        .update({ name: formName.trim(), description: formDesc.trim() || null })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform"] });
      toast({ title: "Form updated" });
    },
  });

  const addField = useMutation({
    mutationFn: async () => {
      const opts = fieldType === "select"
        ? fieldOptions.split(",").map((o) => o.trim()).filter(Boolean)
        : null;

      if (editFieldId) {
        const { error } = await supabase
          .from("onboarding_form_fields")
          .update({
            field_label: fieldLabel.trim(),
            field_type: fieldType,
            is_required: fieldRequired,
            options: opts,
          })
          .eq("id", editFieldId);
        if (error) throw error;
      } else {
        const formTypeMap: Record<string, string> = {
          interest: "parent",
          registration: "parent",
          parent_onboarding: "parent",
          staff_onboarding: "staff",
        };
        const { error } = await supabase.from("onboarding_form_fields").insert({
          branch_id: branchId!,
          form_type: formTypeMap[form!.form_type] || "parent",
          step_label: "Custom",
          field_label: fieldLabel.trim(),
          field_type: fieldType,
          is_required: fieldRequired,
          options: opts,
          sort_order: allFields.length,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform-custom-fields"] });
      setAddFieldOpen(false);
      resetFieldForm();
      toast({ title: editFieldId ? "Field updated" : "Field added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase
        .from("onboarding_form_fields")
        .update({ is_active: false })
        .eq("id", fieldId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform-custom-fields"] });
      toast({ title: "Field removed" });
    },
  });

  const resetFieldForm = () => {
    setFieldLabel("");
    setFieldType("text");
    setFieldRequired(false);
    setFieldOptions("");
    setEditFieldId(null);
  };

  const openEditField = (field: FieldDef) => {
    setEditFieldId(field.id);
    setFieldLabel(field.field_label);
    setFieldType(field.field_type);
    setFieldRequired(field.is_required);
    setFieldOptions(field.options?.join(", ") || "");
    setAddFieldOpen(true);
  };

  const copyFormLink = () => {
    if (form?.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/form/${form.share_token}`);
      toast({ title: "Link copied!" });
    }
  };

  const shareWhatsApp = () => {
    if (form?.share_token) {
      const url = `${window.location.origin}/form/${form.share_token}`;
      const msg = encodeURIComponent(`Please fill out the ${form.name}: ${url}`);
      window.open(`https://wa.me/?text=${msg}`, "_blank");
    }
  };

  if (!form) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/eforms")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Edit Form</h1>
            <p className="text-sm text-muted-foreground">Customize fields for {form.name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyFormLink}>
              <Copy className="h-4 w-4 mr-1" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={shareWhatsApp}>
              <MessageCircle className="h-4 w-4 mr-1" />
              WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`/form/${form.share_token}`, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Preview
            </Button>
          </div>
        </div>

        {/* Form Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Form Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Form Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Form Type</Label>
                <Input value={form.form_type} disabled className="bg-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} />
            </div>
            <Button size="sm" onClick={() => updateForm.mutate()} disabled={updateForm.isPending}>
              <Save className="h-4 w-4 mr-1" />
              {updateForm.isPending ? "Saving..." : "Save Details"}
            </Button>
          </CardContent>
        </Card>

        {/* Form Fields */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Form Fields</CardTitle>
              <CardDescription>Default fields are locked. Add custom questions below.</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                resetFieldForm();
                setAddFieldOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Question
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allFields.map((field, i) => (
                <div
                  key={field.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    field.is_default ? "bg-muted/30 border-border" : "bg-card border-primary/20"
                  }`}
                >
                  <div className="text-muted-foreground">
                    {field.is_default ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <GripVertical className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{field.field_label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {field.field_type}
                      </Badge>
                      {field.is_required && (
                        <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                          Required
                        </Badge>
                      )}
                      {field.is_default && (
                        <Badge variant="outline" className="text-[10px]">Default</Badge>
                      )}
                    </div>
                  </div>
                  {!field.is_default && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditField(field)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteField.mutate(field.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Add/Edit Field Dialog */}
        <Dialog open={addFieldOpen} onOpenChange={(open) => { setAddFieldOpen(open); if (!open) resetFieldForm(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editFieldId ? "Edit Question" : "Add New Question"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Question Label *</Label>
                <Input
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="e.g. Do you have any dietary requirements?"
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((ft) => (
                      <SelectItem key={ft.value} value={ft.value}>
                        {ft.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fieldType === "select" && (
                <div className="space-y-2">
                  <Label>Options (comma-separated)</Label>
                  <Input
                    value={fieldOptions}
                    onChange={(e) => setFieldOptions(e.target.value)}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Compulsory to answer?</Label>
                <Switch checked={fieldRequired} onCheckedChange={setFieldRequired} />
              </div>
              <Button
                className="w-full"
                disabled={!fieldLabel.trim() || addField.isPending}
                onClick={() => addField.mutate()}
              >
                {addField.isPending ? "Saving..." : editFieldId ? "Update Question" : "Add Question"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
