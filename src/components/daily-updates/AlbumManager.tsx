import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalBranch } from "@/hooks/use-branch-context";
import { useAuth } from "@/lib/auth";
import { useTeacherClasses } from "@/hooks/use-teacher-classes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Image as ImageIcon, Search, ChevronDown, ChevronRight, User } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

interface Album {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_active: boolean;
  student_id: string | null;
  class_id: string | null;
  is_personal: boolean;
  latest_photo_url?: string | null;
  student_name?: string;
}

interface Props {
  onOpenAlbum?: (id: string) => void;
}

export function AlbumManager({ onOpenAlbum }: Props) {
  const { user } = useAuth();
  const { selectedBranchId, activeBranchIds } = useGlobalBranch();
  const branchId =
    selectedBranchId && selectedBranchId !== "all" ? selectedBranchId : activeBranchIds[0] ?? "";
  const qc = useQueryClient();
  const { teacherClassIds, isTeacher } = useTeacherClasses(branchId);

  const [editing, setEditing] = useState<Album | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Album | null>(null);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const { data: albums = [], isLoading } = useQuery({
    queryKey: ["albums-manager", branchId, isTeacher, (teacherClassIds ?? []).join(",")],
    queryFn: async () => {
      if (!branchId) return [] as Album[];
      let q = supabase
        .from("learning_albums")
        .select("id, title, description, cover_image_url, is_active, student_id, class_id, is_personal")
        .eq("branch_id", branchId)
        .eq("is_active", true);
      if (isTeacher && teacherClassIds && teacherClassIds.length > 0) {
        q = q.in("class_id", teacherClassIds);
      }
      const { data } = await q.order("title");
      const list = (data ?? []) as Album[];

      // Fetch student names for albums tied to a student
      const studentIds = Array.from(new Set(list.map((a) => a.student_id).filter(Boolean))) as string[];
      let studentMap = new Map<string, string>();
      if (studentIds.length) {
        const { data: students } = await supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds);
        (students ?? []).forEach((s: any) => {
          studentMap.set(s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim());
        });
      }

      // Fetch latest media photo per album (single query, grouped client-side)
      const albumIds = list.map((a) => a.id);
      let latestByAlbum = new Map<string, string>();
      if (albumIds.length) {
        const { data: updates } = await supabase
          .from("child_updates")
          .select("id, album_id, created_at, child_update_media(url, kind, thumbnail_url, sort_order)")
          .in("album_id", albumIds)
          .order("created_at", { ascending: false })
          .limit(500);
        (updates ?? []).forEach((u: any) => {
          if (!u.album_id || latestByAlbum.has(u.album_id)) return;
          const media = (u.child_update_media ?? [])
            .filter((m: any) => m.kind === "video" || m.kind === "photo" || m.kind === "image" || !m.kind)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          if (media[0]?.url) latestByAlbum.set(u.album_id, media[0].thumbnail_url || media[0].url);
        });
      }

      return list.map((a) => ({
        ...a,
        student_name: a.student_id ? studentMap.get(a.student_id) : undefined,
        latest_photo_url: a.cover_image_url || latestByAlbum.get(a.id) || null,
      }));
    },
    enabled: !!branchId,
  });

  const save = useMutation({
    mutationFn: async (payload: { id?: string; title: string; description: string }) => {
      if (!branchId || !user) throw new Error("Missing branch or user");
      if (payload.id) {
        const { error } = await supabase
          .from("learning_albums")
          .update({ title: payload.title.trim(), description: payload.description || null })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("learning_albums").insert({
          branch_id: branchId,
          title: payload.title.trim(),
          description: payload.description || null,
          created_by: user.id,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Album saved");
      qc.invalidateQueries({ queryKey: ["albums-manager"] });
      qc.invalidateQueries({ queryKey: ["daily-updates"] });
      setEditing(null);
      setCreating(false);
    },
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("learning_albums").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Album archived");
      qc.invalidateQueries({ queryKey: ["albums-manager"] });
      qc.invalidateQueries({ queryKey: ["daily-updates"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(friendlyError(e)),
  });

  // Filter by search (album title or student name)
  const q = search.trim().toLowerCase();
  const filtered = q
    ? albums.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.student_name ?? "").toLowerCase().includes(q),
      )
    : albums;

  // Group by student. Albums without student_id go to "Class & Shared".
  const groups = new Map<string, { key: string; label: string; albums: Album[] }>();
  filtered.forEach((a) => {
    const key = a.student_id ?? "__shared__";
    const label = a.student_id ? a.student_name || "Unknown student" : "Class & Shared albums";
    if (!groups.has(key)) groups.set(key, { key, label, albums: [] });
    groups.get(key)!.albums.push(a);
  });
  const groupList = Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground">{filtered.length} album{filtered.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New album</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search albums or students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>{albums.length === 0 ? "No albums yet — create one to start grouping Moments." : "No albums match your search."}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {groupList.map((g, idx) => {
            const isOpen = openGroups[g.key] ?? idx === 0;
            return (
              <Collapsible key={g.key} open={isOpen} onOpenChange={() => toggleGroup(g.key)}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/40 transition">
                  <span className="flex items-center gap-2 text-sm font-medium min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{g.label}</span>
                  </span>
                  <Badge variant="secondary" className="text-[10px] h-5">{g.albums.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 pb-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-1">
                    {g.albums.map((a) => (
                      <Card key={a.id} className="overflow-hidden">
                        <div
                          className="h-32 bg-muted cursor-pointer"
                          onClick={() => onOpenAlbum?.(a.id)}
                        >
                          {a.latest_photo_url ? (
                            <img src={a.latest_photo_url} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3 space-y-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{a.title}</p>
                            {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                          </div>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setEditing(a)}>
                              <Pencil className="h-3 w-3 mr-1" /> Rename
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(a)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <AlbumFormDialog
        open={creating || !!editing}
        album={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={(p) => save.mutate(p)}
        saving={save.isPending}
      />

      <ConfirmDeleteDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Archive album"
        description="Existing Moments tagged to this album will stay visible but the album will be hidden from new updates."
        confirmLabel="Archive"
        confirmText={confirmDelete?.title ?? ""}
        isPending={remove.isPending}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete.id)}
      />
    </div>
  );
}

function AlbumFormDialog({
  open,
  album,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  album: Album | null;
  onClose: () => void;
  onSave: (p: { id?: string; title: string; description: string }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(album?.title ?? "");
      setDescription(album?.description ?? "");
    }
  }, [open, album]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{album ? "Rename album" : "New album"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Outdoor play" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!title.trim() || saving}
            onClick={() => onSave({ id: album?.id, title, description })}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}