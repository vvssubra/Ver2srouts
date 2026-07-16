import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList, Plus, Send, Copy, Eye, Edit, MoreVertical, FileText,
  CheckCircle2, Clock, XCircle, Search, ExternalLink, MessageCircle, Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  sent: { label: "Sent", icon: Send, className: "bg-primary/10 text-primary border-primary/30" },
  opened: { label: "Opened", icon: Eye, className: "bg-accent/10 text-accent-foreground border-accent/30" },
  received: { label: "Received", icon: CheckCircle2, className: "bg-[hsl(var(--role-teacher))]/10 text-[hsl(var(--role-teacher))] border-[hsl(var(--role-teacher))]/30" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-accent/15 text-accent-foreground border-accent/30" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/30" },
};

const formTypeLabels: Record<string, string> = {
  interest: "Interest Form",
  registration: "Registration Form",
  staff_onboarding: "Staff Onboarding",
  parent_onboarding: "Parent Onboarding",
};

export default function EForms() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [sendFormOpen, setSendFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewSubmission, setViewSubmission] = useState<any>(null);

  // New form state
  const [newFormName, setNewFormName] = useState("");
  const [newFormType, setNewFormType] = useState("registration");
  const [newFormDesc, setNewFormDesc] = useState("");

  // Send form state
  const [sendFormId, setSendFormId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");

  const { data: memberships } = useQuery({
    queryKey: ["my-branch-memberships"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const branchId = memberships?.[0]?.branch_id;

  const { data: eforms = [] } = useQuery({
    queryKey: ["eforms", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("eforms")
        .select("*")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["eform-submissions", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("eform_submissions")
        .select("*, eforms(name, form_type)")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const createForm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eforms").insert({
        branch_id: branchId!,
        name: newFormName.trim(),
        form_type: newFormType,
        description: newFormDesc.trim() || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eforms"] });
      setCreateFormOpen(false);
      setNewFormName(""); setNewFormType("registration"); setNewFormDesc("");
      toast({ title: "Form created", description: "Your e-Form has been created." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendForm = useMutation({
    mutationFn: async () => {
      const form = eforms.find((f: any) => f.id === sendFormId);
      if (!form) throw new Error("Select a form");
      const { error } = await supabase.from("eform_submissions").insert({
        eform_id: sendFormId,
        branch_id: branchId!,
        recipient_name: recipientName.trim(),
        recipient_email: recipientEmail.trim(),
        recipient_phone: recipientPhone.trim() || null,
        status: "sent",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform-submissions"] });
      setSendFormOpen(false);
      setRecipientName(""); setRecipientEmail(""); setRecipientPhone(""); setSendFormId("");
      toast({ title: "Form sent", description: "The form link has been sent." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateSubmissionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("eform_submissions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform-submissions"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteSubmission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eform_submissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eform-submissions"] });
      toast({ title: "Submission deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      // Delete submissions first
      await supabase.from("eform_submissions").delete().eq("eform_id", id);
      const { error } = await supabase.from("eforms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eforms"] });
      queryClient.invalidateQueries({ queryKey: ["eform-submissions"] });
      toast({ title: "Form deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyFormLink = (token: string) => {
    const url = `${window.location.origin}/form/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Form link copied to clipboard." });
  };

  const shareWhatsApp = (token: string, formName: string) => {
    const url = `${window.location.origin}/form/${token}`;
    const msg = encodeURIComponent(`Please fill out the ${formName}: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const filteredSubmissions = submissions.filter((s: any) => {
    const matchesSearch =
      !searchQuery ||
      s.recipient_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.child_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.recipient_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalSent = submissions.filter((s: any) => s.status === "sent").length;
  const totalReceived = submissions.filter((s: any) => s.status === "received").length;
  const totalApproved = submissions.filter((s: any) => s.status === "approved").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">e-Forms</h1>
            <p className="text-sm text-muted-foreground">Manage enrollment forms, track submissions, and send form links</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={sendFormOpen} onOpenChange={setSendFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Send className="mr-2 h-4 w-4" />Send Form</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Send Form to Recipient</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select Form *</Label>
                    <Select value={sendFormId} onValueChange={setSendFormId}>
                      <SelectTrigger><SelectValue placeholder="Choose a form..." /></SelectTrigger>
                      <SelectContent>
                        {eforms.filter((f: any) => f.is_active).map((f: any) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Recipient Name *</Label>
                    <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Parent's name" />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="parent@email.com" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+60 12-345 6789" />
                  </div>
                  <Button className="w-full" disabled={!sendFormId || !recipientName.trim() || !recipientEmail.trim() || sendForm.isPending} onClick={() => sendForm.mutate()}>
                    {sendForm.isPending ? "Sending..." : "Send Form Link"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createFormOpen} onOpenChange={setCreateFormOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Form</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create New e-Form</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Form Name *</Label>
                    <Input value={newFormName} onChange={(e) => setNewFormName(e.target.value)} placeholder="e.g. Registration Form 2026" />
                  </div>
                  <div>
                    <Label>Form Type *</Label>
                    <Select value={newFormType} onValueChange={setNewFormType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interest">Interest Form</SelectItem>
                        <SelectItem value="registration">Registration Form</SelectItem>
                        <SelectItem value="parent_onboarding">Parent Onboarding</SelectItem>
                        <SelectItem value="staff_onboarding">Staff Onboarding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={newFormDesc} onChange={(e) => setNewFormDesc(e.target.value)} placeholder="Optional description" rows={2} />
                  </div>
                  <Button className="w-full" disabled={!newFormName.trim() || createForm.isPending} onClick={() => createForm.mutate()}>
                    {createForm.isPending ? "Creating..." : "Create Form"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2"><FileText className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold text-foreground">{eforms.length}</p><p className="text-xs text-muted-foreground">Total Forms</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2"><Send className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold text-foreground">{totalSent}</p><p className="text-xs text-muted-foreground">Sent</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-accent/10 p-2"><CheckCircle2 className="h-5 w-5 text-accent" /></div><div><p className="text-2xl font-bold text-foreground">{totalReceived}</p><p className="text-xs text-muted-foreground">Received</p></div></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-accent/15 p-2"><CheckCircle2 className="h-5 w-5 text-accent" /></div><div><p className="text-2xl font-bold text-foreground">{totalApproved}</p><p className="text-xs text-muted-foreground">Approved</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="status">
          <TabsList>
            <TabsTrigger value="status"><ClipboardList className="h-4 w-4 mr-1" />Status</TabsTrigger>
            <TabsTrigger value="forms"><FileText className="h-4 w-4 mr-1" />Forms</TabsTrigger>
          </TabsList>

          {/* Status Tab */}
          <TabsContent value="status" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="hidden sm:table-cell">Child</TableHead>
                    <TableHead className="hidden md:table-cell">Form</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No submissions found</TableCell>
                    </TableRow>
                  ) : (
                    filteredSubmissions.map((sub: any) => {
                      const sc = statusConfig[sub.status] || statusConfig.sent;
                      const StatusIcon = sc.icon;
                      return (
                        <TableRow key={sub.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm text-foreground">{sub.recipient_name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{sub.recipient_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm text-foreground">{sub.child_name || "—"}</span>
                            {sub.child_level && <p className="text-xs text-muted-foreground">{sub.child_level}</p>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-sm text-foreground">{(sub.eforms as any)?.name || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${sc.className}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />{sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {format(new Date(sub.created_at), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {/* Inline approve/reject for received */}
                              {sub.status === "received" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 text-success border-success/30 hover:bg-success/10 dark:text-success dark:border-success/50"
                                    onClick={() => updateSubmissionStatus.mutate({ id: sub.id, status: "approved" })}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                                    onClick={() => updateSubmissionStatus.mutate({ id: sub.id, status: "rejected" })}
                                  >
                                    <XCircle className="h-3 w-3" />Reject
                                  </Button>
                                </>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setViewSubmission(sub)}>
                                    <Eye className="mr-2 h-4 w-4" />View Data
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      if (confirm("Delete this submission?")) deleteSubmission.mutate(sub.id);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Forms Tab */}
          <TabsContent value="forms" className="space-y-4">
            <div className="grid gap-4">
              {eforms.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground mb-4">No forms created yet</p>
                    <Button onClick={() => setCreateFormOpen(true)}><Plus className="mr-2 h-4 w-4" />Create Your First Form</Button>
                  </CardContent>
                </Card>
              ) : (
                eforms.map((form: any) => {
                  const subCount = submissions.filter((s: any) => s.eform_id === form.id).length;
                  const receivedCount = submissions.filter((s: any) => s.eform_id === form.id && (s.status === "received" || s.status === "approved")).length;
                  return (
                    <Card key={form.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground truncate">{form.name}</h3>
                              <Badge variant="outline" className="text-xs shrink-0">{formTypeLabels[form.form_type] || form.form_type}</Badge>
                              {!form.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                            </div>
                            {form.description && <p className="text-sm text-muted-foreground mb-2">{form.description}</p>}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{subCount} sent</span>
                              <span>{receivedCount} responses</span>
                              <span>Created {format(new Date(form.created_at), "dd MMM yyyy")}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyFormLink(form.share_token)} title="Copy link">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shareWhatsApp(form.share_token, form.name)} title="Share via WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`/form/${form.share_token}`, "_blank")} title="Preview">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => navigate(`/eforms/${form.id}`)}>
                              <Edit className="h-4 w-4 mr-1" />Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Form</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently delete "{form.name}" and all its submissions. This cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteForm.mutate(form.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Submission Detail Dialog */}
        <Dialog open={!!viewSubmission} onOpenChange={(open) => !open && setViewSubmission(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Submission Details</DialogTitle></DialogHeader>
            {viewSubmission && (() => {
              const sc = statusConfig[viewSubmission.status] || statusConfig.sent;
              const StatusIcon = sc.icon;
              const data = viewSubmission.submitted_data as Record<string, any> | null;
              return (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-muted-foreground">Recipient</p><p className="text-sm font-medium text-foreground">{viewSubmission.recipient_name || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm text-foreground">{viewSubmission.recipient_email}</p></div>
                    {viewSubmission.recipient_phone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm text-foreground">{viewSubmission.recipient_phone}</p></div>}
                    <div><p className="text-xs text-muted-foreground">Form</p><p className="text-sm text-foreground">{(viewSubmission.eforms as any)?.name || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={`text-xs ${sc.className}`}><StatusIcon className="h-3 w-3 mr-1" />{sc.label}</Badge></div>
                    <div><p className="text-xs text-muted-foreground">Sent On</p><p className="text-sm text-foreground">{format(new Date(viewSubmission.created_at), "dd MMM yyyy, h:mm a")}</p></div>
                    {viewSubmission.submitted_at && <div><p className="text-xs text-muted-foreground">Submitted On</p><p className="text-sm text-foreground">{format(new Date(viewSubmission.submitted_at), "dd MMM yyyy, h:mm a")}</p></div>}
                    {viewSubmission.child_name && <div><p className="text-xs text-muted-foreground">Child</p><p className="text-sm text-foreground">{viewSubmission.child_name}{viewSubmission.child_level ? ` (${viewSubmission.child_level})` : ""}</p></div>}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">Submitted Data</h4>
                    {!data || Object.keys(data).length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No data submitted yet — form is still pending.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(data).map(([key, value]) => (
                          <div key={key} className="rounded-lg border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground mb-0.5">{key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value || "—")}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {viewSubmission.status === "received" && (
                    <div className="flex gap-2 pt-2">
                      <Button className="flex-1" onClick={() => { updateSubmissionStatus.mutate({ id: viewSubmission.id, status: "approved" }); setViewSubmission(null); }}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Approve
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={() => { updateSubmissionStatus.mutate({ id: viewSubmission.id, status: "rejected" }); setViewSubmission(null); }}>
                        <XCircle className="h-4 w-4 mr-1" />Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
