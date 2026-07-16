import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, FolderOpen, Camera, Image, Video, Trash2, Eye, EyeOff, Users, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function LearningMedia() {
  const { user, role } = useAuth();
  const { selectedBranchId } = useGlobalBranch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("activities");
  const [showAlbumDialog, setShowAlbumDialog] = useState(false);
  const isManager = role === "super_admin" || role === "franchisee" || role === "admin";

  const branchId = selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : null;

  // Fetch albums
  const { data: albums = [] } = useQuery({
    queryKey: ["learning-albums", branchId],
    queryFn: async () => {
      const q = supabase.from("learning_albums").select("*, classes(class_name)").eq("is_active", true).order("created_at", { ascending: false });
      if (branchId) q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Fetch activities
  const { data: activities = [] } = useQuery({
    queryKey: ["learning-activities", branchId],
    queryFn: async () => {
      const q = supabase
        .from("learning_activities")
        .select("*, learning_albums(title), classes(class_name), development_domains(name), learning_activity_media(*), learning_activity_students(student_id, students(first_name, last_name))")
        .order("activity_date", { ascending: false })
        .limit(50);
      if (branchId) q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Fetch classes
  const { data: classes = [] } = useQuery({
    queryKey: ["classes", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data } = await supabase.from("classes").select("id, class_name").eq("branch_id", branchId).eq("is_active", true);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Fetch students
  const { data: students = [] } = useQuery({
    queryKey: ["students-for-tagging", branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data } = await supabase.from("students").select("id, first_name, last_name, class_id").eq("branch_id", branchId).eq("is_active", true).order("first_name");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  // Fetch domains
  const { data: domains = [] } = useQuery({
    queryKey: ["domains-media"],
    queryFn: async () => {
      const { data } = await supabase.from("development_domains").select("id, name").order("sort_order");
      return data ?? [];
    },
  });

  // Delete activity
  const deleteActivity = useMutation({
    mutationFn: async (activityId: string) => {
      // Delete media files from storage first
      const { data: media } = await supabase.from("learning_activity_media").select("media_url").eq("activity_id", activityId);
      if (media?.length) {
        const paths = media.map(m => {
          const url = new URL(m.media_url);
          return url.pathname.split("/learning-media/").pop() || "";
        }).filter(Boolean);
        if (paths.length) await supabase.storage.from("learning-media").remove(paths);
      }
      const { error } = await supabase.from("learning_activities").delete().eq("id", activityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-activities"] });
      toast.success("Activity deleted");
    },
  });

  // Toggle visibility
  const toggleVisibility = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase.from("learning_activities").update({ visible_to_parents: visible }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["learning-activities"] });
      toast.success("Visibility updated");
    },
  });

  if (!branchId) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Please select a branch to manage learning media</CardContent></Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Learning Media</h1>
            <p className="text-sm text-muted-foreground">Share photos & videos of class activities with parents</p>
          </div>
          <div className="flex gap-2">
            {isManager && (
              <Button variant="outline" size="sm" onClick={() => setShowAlbumDialog(true)}>
                <FolderOpen className="h-4 w-4 mr-1" /> New Album
              </Button>
            )}
            <Button size="sm" onClick={() => navigate("/daily-updates")}>
              <Camera className="h-4 w-4 mr-1" /> New Learning Moment
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="activities">Activities</TabsTrigger>
            <TabsTrigger value="albums">Albums ({albums.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="activities" className="space-y-4 mt-4">
            {!activities.length ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Camera className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg font-medium mb-1">No activities yet</p>
                  <p className="text-sm">Click "Post Activity" to share photos and videos of class activities</p>
                </CardContent>
              </Card>
            ) : activities.map((activity: any) => (
              <Card key={activity.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{activity.title}</h3>
                        {activity.learning_albums?.title && (
                          <Badge variant="outline" className="text-xs"><FolderOpen className="h-3 w-3 mr-1" />{activity.learning_albums.title}</Badge>
                        )}
                        {activity.development_domains?.name && (
                          <Badge variant="secondary" className="text-xs">{activity.development_domains.name}</Badge>
                        )}
                        {activity.classes?.class_name && (
                          <Badge variant="secondary" className="text-xs">{activity.classes.class_name}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(activity.activity_date), "dd MMM yyyy")}
                        {activity.learning_activity_students?.length > 0 && (
                          <span> · <Users className="h-3 w-3 inline" /> {activity.learning_activity_students.length} students tagged</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleVisibility.mutate({ id: activity.id, visible: !activity.visible_to_parents })}
                        title={activity.visible_to_parents ? "Visible to parents" : "Hidden from parents"}
                      >
                        {activity.visible_to_parents ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteActivity.mutate(activity.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {activity.description && <p className="text-sm text-foreground/80">{activity.description}</p>}
                  {activity.learning_activity_media?.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {activity.learning_activity_media.sort((a: any, b: any) => a.sort_order - b.sort_order).map((m: any) => (
                        <div key={m.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                          {m.media_type === "video" ? (
                            <video src={m.media_url} className="w-full h-full object-cover" controls />
                          ) : (
                            <img src={m.media_url} alt={m.caption || ""} className="w-full h-full object-cover" />
                          )}
                          {m.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                              <p className="text-[10px] text-white truncate">{m.caption}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {activity.learning_activity_students?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activity.learning_activity_students.slice(0, 8).map((s: any) => (
                        <Badge key={s.student_id} variant="outline" className="text-[10px]">
                          {s.students?.first_name} {s.students?.last_name?.[0]}.
                        </Badge>
                      ))}
                      {activity.learning_activity_students.length > 8 && (
                        <Badge variant="outline" className="text-[10px]">+{activity.learning_activity_students.length - 8} more</Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="albums" className="space-y-3 mt-4">
            {!albums.length ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-lg font-medium mb-1">No albums yet</p>
                  <p className="text-sm">{isManager ? "Create albums to organize learning activities" : "Your admin will create albums for you to use"}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {albums.map((album: any) => {
                  const activityCount = activities.filter((a: any) => a.album_id === album.id).length;
                  return (
                    <Card key={album.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FolderOpen className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm truncate">{album.title}</h3>
                            {album.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{album.description}</p>}
                            <div className="flex items-center gap-2 mt-2">
                              {album.classes?.class_name && <Badge variant="secondary" className="text-[10px]">{album.classes.class_name}</Badge>}
                              <span className="text-[10px] text-muted-foreground">{activityCount} activities</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Album Dialog */}
      <CreateAlbumDialog
        open={showAlbumDialog}
        onOpenChange={setShowAlbumDialog}
        branchId={branchId}
        classes={classes}
        userId={user?.id || ""}
      />
    </DashboardLayout>
  );
}

// --- Album Dialog ---
function CreateAlbumDialog({ open, onOpenChange, branchId, classes, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  branchId: string; classes: any[]; userId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setSaving(true);
    const { error } = await supabase.from("learning_albums").insert({
      branch_id: branchId, title: title.trim(), description: description.trim() || null,
      class_id: classId || null, created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Album created");
    queryClient.invalidateQueries({ queryKey: ["learning-albums"] });
    setTitle(""); setDescription(""); setClassId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Album</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Nature Walk, Art Week" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What this album is about..." rows={2} /></div>
          <div>
            <Label>Class (optional)</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Creating..." : "Create Album"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Activity Dialog ---
function CreateActivityDialog({ open, onOpenChange, branchId, albums, classes, students, domains, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  branchId: string; albums: any[]; classes: any[]; students: any[];
  domains: any[]; userId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [activityDate, setActivityDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [albumId, setAlbumId] = useState("");
  const [classId, setClassId] = useState("");
  const [domainId, setDomainId] = useState("");
  const [visibleToParents, setVisibleToParents] = useState(true);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const filteredStudents = classId ? students.filter((s: any) => s.class_id === classId) : students;

  const selectAllStudents = () => {
    setSelectedStudents(filteredStudents.map((s: any) => s.id));
  };

  const deselectAllStudents = () => {
    setSelectedStudents([]);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!files.length) return toast.error("Please add at least one photo or video");
    if (!selectedStudents.length) return toast.error("Please tag at least one student");

    setUploading(true);
    try {
      const activityId = crypto.randomUUID();
      const { error: actErr } = await supabase.from("learning_activities").insert({
        id: activityId,
        branch_id: branchId, title: title.trim(), description: description.trim() || null,
        activity_date: activityDate, album_id: albumId || null,
        class_id: classId || null, domain_id: domainId || null,
        visible_to_parents: visibleToParents, created_by: userId,
      });
      if (actErr) throw actErr;

      // 2. Upload files and create media records
      const mediaRecords = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${branchId}/${activityId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("learning-media").upload(path, file);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("learning-media").getPublicUrl(path);
        const isVideo = file.type.startsWith("video/");
        mediaRecords.push({
          activity_id: activityId, media_url: urlData.publicUrl,
          media_type: isVideo ? "video" : "image", sort_order: i,
        });
      }
      if (mediaRecords.length) {
        const { error: mErr } = await supabase.from("learning_activity_media").insert(mediaRecords);
        if (mErr) throw mErr;
      }

      // 3. Tag students
      const studentTags = selectedStudents.map(sid => ({ activity_id: activityId, student_id: sid }));
      const { error: sErr } = await supabase.from("learning_activity_students").insert(studentTags);
      if (sErr) throw sErr;

      toast.success("Activity posted successfully!");
      queryClient.invalidateQueries({ queryKey: ["learning-activities"] });
      // Reset form
      setTitle(""); setDescription(""); setAlbumId(""); setClassId(""); setDomainId("");
      setVisibleToParents(false); setSelectedStudents([]); setFiles([]);
      setActivityDate(format(new Date(), "yyyy-MM-dd"));
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to post activity");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Post Learning Activity</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Water Play, Art & Craft" /></div>
            <div><Label>Date</Label><Input type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} /></div>
            <div>
              <Label>Album</Label>
              <Select value={albumId} onValueChange={setAlbumId}>
                <SelectTrigger><SelectValue placeholder="No album" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No album</SelectItem>
                  {albums.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSelectedStudents([]); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Domain</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {domains.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What happened during this activity..." rows={2} /></div>

          {/* File Upload */}
          <div>
            <Label>Photos & Videos *</Label>
            <div className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center">
              <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} className="hidden" id="media-upload" />
              <label htmlFor="media-upload" className="cursor-pointer">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Image className="h-5 w-5" /><Video className="h-5 w-5" />
                  <span className="text-sm">Click to add photos & videos</span>
                </div>
              </label>
            </div>
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {files.map((file, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                    {file.type.startsWith("video/") ? (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Video className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground absolute bottom-1">{file.name.slice(0, 10)}</span>
                      </div>
                    ) : (
                      <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Student Tagging */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Tag Students *</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAllStudents}>Select All ({filteredStudents.length})</Button>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={deselectAllStudents}>Clear</Button>
              </div>
            </div>
            <div className="border rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No students found</p>
              ) : filteredStudents.map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                  <Checkbox checked={selectedStudents.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                  {s.first_name} {s.last_name}
                </label>
              ))}
            </div>
            {selectedStudents.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{selectedStudents.length} student(s) selected</p>
            )}
          </div>

          {/* Share with parents */}
          <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Visible to parents</p>
              <p className="text-xs text-muted-foreground">Tagged students' parents will see this in their child's Story feed and Albums.</p>
            </div>
            <Switch checked={visibleToParents} onCheckedChange={setVisibleToParents} />
          </div>

          <Button onClick={handleSubmit} disabled={uploading} className="w-full">
            {uploading ? "Uploading..." : `Post Activity (${files.length} file${files.length !== 1 ? "s" : ""})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
