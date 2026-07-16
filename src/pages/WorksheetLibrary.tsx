import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { useToast } from "@/hooks/use-toast";
import { BackToCommandCenter } from "@/components/curriculum/BackToCommandCenter";
import {
  Search, Upload, FileText, Download, Trash2, Plus, Tag, X,
  ExternalLink, Pencil, BookOpen, Music, Lightbulb, ClipboardList,
  BookMarked, Bot, Loader2,
} from "lucide-react";

const RESOURCE_TYPES = [
  { value: "all", label: "All", icon: FileText },
  { value: "book", label: "Books", icon: BookOpen },
  { value: "song", label: "Songs", icon: Music },
  { value: "activity", label: "Activities", icon: Lightbulb },
  { value: "worksheet", label: "Worksheets", icon: ClipboardList },
  { value: "lesson_plan", label: "Lesson Plans", icon: BookMarked },
  { value: "teaching_guide", label: "Guides", icon: FileText },
];

const AGE_GROUP_OPTIONS = [
  { value: "AGE2", label: "2 Years" },
  { value: "AGE3", label: "3 Years" },
  { value: "AGE4", label: "4 Years" },
  { value: "AGE5", label: "5 Years" },
  { value: "AGE6", label: "6 Years" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "ta", label: "Tamil" },
  { value: "zh", label: "Chinese" },
];

function getResourceIcon(type: string) {
  switch (type) {
    case "book": return BookOpen;
    case "song": return Music;
    case "activity": return Lightbulb;
    case "lesson_plan": return BookMarked;
    case "teaching_guide": return FileText;
    default: return ClipboardList;
  }
}

export default function WorksheetLibrary() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedBranchId: branchId } = useGlobalBranch();
  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState<string[]>([]);

  // For teachers: derive age groups from their assigned class age (e.g., "2 Tahun" -> AGE2).
  // Pre-select once when teacher classes load.
  const { data: teacherClassRows = [] } = useQuery({
    queryKey: ["worksheet-teacher-classes", branchId, (teacherClassIds ?? []).join(",")],
    queryFn: async () => {
      if (!branchId || !teacherClassIds || teacherClassIds.length === 0) return [];
      const { data } = await supabase
        .from("classes")
        .select("id, age_group")
        .in("id", teacherClassIds);
      return data ?? [];
    },
    enabled: !!branchId && isTeacher && !!teacherClassIds && teacherClassIds.length > 0,
  });
  const [didDefaultAge, setDidDefaultAge] = useState(false);
  useEffect(() => {
    if (didDefaultAge || !isTeacher || teacherClassRows.length === 0) return;
    const codes = new Set<string>();
    teacherClassRows.forEach((c: any) => {
      const m = String(c.age_group ?? "").match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 2 && n <= 6) codes.add(`AGE${n}`);
      }
    });
    if (codes.size > 0) {
      setAgeFilter(Array.from(codes));
      setDidDefaultAge(true);
    }
  }, [isTeacher, teacherClassRows, didDefaultAge]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Upload form state
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("worksheet");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
  const [language, setLanguage] = useState("en");
  const [author, setAuthor] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contentText, setContentText] = useState("");
  const [isAiReference, setIsAiReference] = useState(true);

  // Edit form state
  const [editId, setEditId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editResourceType, setEditResourceType] = useState("worksheet");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editAgeGroups, setEditAgeGroups] = useState<string[]>([]);
  const [editLanguage, setEditLanguage] = useState("en");
  const [editAuthor, setEditAuthor] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editContentText, setEditContentText] = useState("");
  const [editIsAiReference, setEditIsAiReference] = useState(true);

  // Fetch profile
  const { data: profile } = useQuery({
    queryKey: ["my-profile-library", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("can_manage_library").eq("id", user.id).single();
      return data;
    },
    enabled: !!user?.id,
  });

  const canManage = role === "super_admin" || !!(profile as any)?.can_manage_library;

  // Fetch worksheets / resources
  const { data: worksheets = [], isLoading } = useQuery({
    queryKey: ["worksheets", search, typeFilter, subjectFilter, ageFilter, branchId],
    queryFn: async () => {
      let query = (supabase
        .from("worksheets")
        .select("*")
        .order("created_at", { ascending: false })) as any;

      if (typeFilter !== "all") {
        query = query.eq("resource_type", typeFilter);
      }
      if (subjectFilter !== "all") {
        query = query.eq("subject", subjectFilter);
      }
      if (ageFilter.length > 0) {
        query = query.overlaps("age_groups", ageFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = data || [];
      if (search.trim()) {
        const s = search.toLowerCase();
        results = results.filter(
          (w: any) =>
            w.title.toLowerCase().includes(s) ||
            w.subject.toLowerCase().includes(s) ||
            (w.description || "").toLowerCase().includes(s) ||
            (w.author || "").toLowerCase().includes(s) ||
            (w.metadata_tags || []).some((t: string) => t.toLowerCase().includes(s))
        );
      }
      return results;
    },
  });

  const subjects: string[] = [...new Set(worksheets.map((w: any) => w.subject).filter(Boolean))] as string[];

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));
  const addEditTag = () => {
    const t = editTagInput.trim().toLowerCase();
    if (t && !editTags.includes(t)) setEditTags([...editTags, t]);
    setEditTagInput("");
  };
  const removeEditTag = (tag: string) => setEditTags(editTags.filter((t) => t !== tag));

  const toggleAgeGroup = (code: string, current: string[], setter: (v: string[]) => void) => {
    setter(current.includes(code) ? current.filter(a => a !== code) : [...current, code]);
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!title || !subject) throw new Error("Missing required fields");

      setUploading(true);
      let pdfUrl = "";

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("worksheets").upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("worksheets").getPublicUrl(path);
        pdfUrl = urlData.publicUrl;
      }

      const insertData: any = {
        title,
        subject,
        description,
        metadata_tags: tags,
        resource_type: resourceType,
        age_groups: selectedAgeGroups,
        language,
        author: author || null,
        source_url: sourceUrl || null,
        content_text: contentText || null,
        is_ai_reference: isAiReference,
        branch_id: branchId || null,
      };
      if (pdfUrl) insertData.pdf_url = pdfUrl;

      const { error: insertError } = await supabase.from("worksheets").insert(insertData as any);
      if (insertError) throw insertError;

      // If PDF was uploaded and it's a lesson plan or teaching guide, try to extract content
      if (pdfUrl && (resourceType === "lesson_plan" || resourceType === "teaching_guide") && !contentText) {
        try {
          await supabase.functions.invoke("extract-resource-content", {
            body: { pdf_url: pdfUrl, title },
          });
        } catch (e) {
          console.warn("Content extraction skipped:", e);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Resource uploaded! 📄" });
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      resetForm();
      setUploadOpen(false);
    },
    onError: (e) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
    onSettled: () => setUploading(false),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTitle || !editSubject) throw new Error("Missing required fields");
      const { error } = await supabase.from("worksheets").update({
        title: editTitle,
        subject: editSubject,
        description: editDescription,
        metadata_tags: editTags,
        resource_type: editResourceType,
        age_groups: editAgeGroups,
        language: editLanguage,
        author: editAuthor || null,
        source_url: editSourceUrl || null,
        content_text: editContentText || null,
        is_ai_reference: editIsAiReference,
      } as any).eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Resource updated ✏️" });
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
      setEditOpen(false);
    },
    onError: (e) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worksheets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Resource deleted" });
      queryClient.invalidateQueries({ queryKey: ["worksheets"] });
    },
  });

  const resetForm = () => {
    setTitle(""); setSubject(""); setDescription(""); setTags([]); setTagInput(""); setFile(null);
    setResourceType("worksheet"); setSelectedAgeGroups([]); setLanguage("en");
    setAuthor(""); setSourceUrl(""); setContentText(""); setIsAiReference(true);
  };

  const openEdit = (ws: any) => {
    setEditId(ws.id);
    setEditTitle(ws.title);
    setEditSubject(ws.subject);
    setEditDescription(ws.description || "");
    setEditResourceType(ws.resource_type || "worksheet");
    setEditTags(ws.metadata_tags || []);
    setEditTagInput("");
    setEditAgeGroups(ws.age_groups || []);
    setEditLanguage(ws.language || "en");
    setEditAuthor(ws.author || "");
    setEditSourceUrl(ws.source_url || "");
    setEditContentText(ws.content_text || "");
    setEditIsAiReference(ws.is_ai_reference ?? true);
    setEditOpen(true);
  };

  const needsFile = resourceType === "worksheet" || resourceType === "lesson_plan" || resourceType === "teaching_guide";

  return (
    <DashboardLayout>
      <BackToCommandCenter tab="lessons" />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teaching Resources</h1>
            <p className="text-muted-foreground">
              Books, songs, worksheets, lesson plans — your school's AI knowledge base
            </p>
          </div>
          {canManage && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button><Upload className="h-4 w-4 mr-2" />Add Resource</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Teaching Resource</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Resource Type *</Label>
                    <Select value={resourceType} onValueChange={setResourceType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPES.filter(r => r.value !== "all").map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Title *</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={resourceType === "book" ? "e.g. The Very Hungry Caterpillar" : resourceType === "song" ? "e.g. Twinkle Twinkle Little Star" : "Resource title"} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Subject / Category *</Label>
                      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Literacy, Math" />
                    </div>
                    <div>
                      <Label>Language</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.map(l => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(resourceType === "book" || resourceType === "song") && (
                    <div>
                      <Label>{resourceType === "book" ? "Author" : "Composer / Source"}</Label>
                      <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={resourceType === "book" ? "Eric Carle" : "Traditional / Artist name"} />
                    </div>
                  )}
                  {resourceType === "song" && (
                    <div>
                      <Label>YouTube / Audio Link</Label>
                      <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://youtube.com/..." />
                    </div>
                  )}
                  <div>
                    <Label>Age Groups</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {AGE_GROUP_OPTIONS.map(ag => (
                        <Badge
                          key={ag.value}
                          variant={selectedAgeGroups.includes(ag.value) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleAgeGroup(ag.value, selectedAgeGroups, setSelectedAgeGroups)}
                        >
                          {ag.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={2} />
                  </div>
                  <div>
                    <Label>{resourceType === "song" ? "Lyrics / Content" : resourceType === "book" ? "Summary / Key Themes" : "Content Text (for AI reference)"}</Label>
                    <Textarea value={contentText} onChange={(e) => setContentText(e.target.value)} placeholder={resourceType === "song" ? "Paste lyrics here..." : resourceType === "book" ? "Summary and key themes for AI..." : "Paste or type content for AI context..."} rows={3} />
                  </div>
                  <div>
                    <Label>Tags</Label>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {tags.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1">
                          {t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(t)} />
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add a tag" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} />
                      <Button type="button" size="sm" variant="outline" onClick={addTag}><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {needsFile && (
                    <div>
                      <Label>File (PDF) {resourceType === "worksheet" ? "*" : ""}</Label>
                      <Input type="file" accept=".pdf,.doc,.docx,.pptx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Bot className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1">
                      <Label className="text-sm">Include in AI suggestions</Label>
                      <p className="text-xs text-muted-foreground">AI will reference this when generating plans</p>
                    </div>
                    <Switch checked={isAiReference} onCheckedChange={setIsAiReference} />
                  </div>
                  <Button className="w-full" disabled={!title || !subject || (resourceType === "worksheet" && !file) || uploading} onClick={() => uploadMutation.mutate()}>
                    {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : "Add Resource"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Resource Type Tabs */}
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {RESOURCE_TYPES.map(r => {
              const Icon = r.icon;
              return (
                <TabsTrigger key={r.value} value={r.value} className="gap-1.5 text-xs">
                  <Icon className="h-3.5 w-3.5" />{r.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Age Group Filter + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-wrap gap-1.5">
            {AGE_GROUP_OPTIONS.map(ag => (
              <Badge
                key={ag.value}
                variant={ageFilter.includes(ag.value) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleAgeGroup(ag.value, ageFilter, setAgeFilter)}
              >
                {ag.label}
              </Badge>
            ))}
            {ageFilter.length > 0 && (
              <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => setAgeFilter([])}>
                <X className="h-3 w-3 mr-1" />Clear
              </Badge>
            )}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by title, author, tags..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-6 h-40" /></Card>
            ))}
          </div>
        ) : worksheets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-lg font-medium">No resources found</p>
              <p className="text-sm">{search ? "Try a different search term" : "Add your first teaching resource to build the AI knowledge base"}</p>
            </CardContent>
          </Card>
        ) : canManage ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden md:table-cell">Subject</TableHead>
                    <TableHead className="hidden lg:table-cell">Ages</TableHead>
                    <TableHead className="hidden lg:table-cell">AI</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {worksheets.map((ws: any) => {
                    const Icon = getResourceIcon(ws.resource_type || "worksheet");
                    return (
                      <TableRow key={ws.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-sm block truncate max-w-[200px]">{ws.title}</span>
                              {ws.author && <span className="text-xs text-muted-foreground">{ws.author}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {(ws.resource_type || "worksheet").replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="secondary" className="text-[10px]">{ws.subject}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex gap-0.5">
                            {(ws.age_groups || []).map((ag: string) => (
                              <Badge key={ag} variant="outline" className="text-[9px] py-0 px-1">{ag.replace("AGE", "")}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {ws.is_ai_reference !== false ? (
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <span className="text-muted-foreground text-xs">Off</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {ws.pdf_url && (
                              <>
                                <Button size="sm" variant="ghost" asChild>
                                  <a href={ws.pdf_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                                </Button>
                                <Button size="sm" variant="ghost" asChild>
                                  <a href={ws.pdf_url} download><Download className="h-3.5 w-3.5" /></a>
                                </Button>
                              </>
                            )}
                            {ws.source_url && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={ws.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openEdit(ws)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => {
                              if (confirm("Delete this resource?")) deleteMutation.mutate(ws.id);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {worksheets.map((ws: any) => {
              const Icon = getResourceIcon(ws.resource_type || "worksheet");
              return (
                <Card key={ws.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm leading-tight truncate">{ws.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ws.subject} · {(ws.resource_type || "worksheet").replace("_", " ")}
                          {ws.author && ` · ${ws.author}`}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {ws.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{ws.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(ws.age_groups || []).map((ag: string) => (
                        <Badge key={ag} variant="secondary" className="text-[10px] py-0">{ag.replace("AGE", "")}yr</Badge>
                      ))}
                      {(ws.metadata_tags || []).slice(0, 3).map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-[10px] py-0">
                          <Tag className="h-2.5 w-2.5 mr-1" />{tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {ws.pdf_url && (
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <a href={ws.pdf_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />View
                          </a>
                        </Button>
                      )}
                      {ws.source_url && (
                        <Button size="sm" variant="outline" className="flex-1" asChild>
                          <a href={ws.source_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />Link
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resource Type</Label>
              <Select value={editResourceType} onValueChange={setEditResourceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.filter(r => r.value !== "all").map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Subject *</Label>
                <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              </div>
              <div>
                <Label>Language</Label>
                <Select value={editLanguage} onValueChange={setEditLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map(l => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Author</Label>
              <Input value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} />
            </div>
            <div>
              <Label>Source URL</Label>
              <Input value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)} />
            </div>
            <div>
              <Label>Age Groups</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {AGE_GROUP_OPTIONS.map(ag => (
                  <Badge
                    key={ag.value}
                    variant={editAgeGroups.includes(ag.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleAgeGroup(ag.value, editAgeGroups, setEditAgeGroups)}
                  >
                    {ag.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Content Text (for AI)</Label>
              <Textarea value={editContentText} onChange={(e) => setEditContentText(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {editTags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeEditTag(t)} />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={editTagInput} onChange={(e) => setEditTagInput(e.target.value)} placeholder="Add a tag" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEditTag())} />
                <Button type="button" size="sm" variant="outline" onClick={addEditTag}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Bot className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <Label className="text-sm">Include in AI suggestions</Label>
                <p className="text-xs text-muted-foreground">AI will reference this resource</p>
              </div>
              <Switch checked={editIsAiReference} onCheckedChange={setEditIsAiReference} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={!editTitle || !editSubject || editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
