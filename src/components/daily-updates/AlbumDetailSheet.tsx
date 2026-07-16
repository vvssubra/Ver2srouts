import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Calendar, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { VideoThumb } from "./VideoThumb";

interface Props {
  albumId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAddToAlbum?: (albumId: string) => void;
}

export function AlbumDetailSheet({ albumId, open, onOpenChange, onAddToAlbum }: Props) {
  const [album, setAlbum] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !albumId) return;
    setLoading(true);
    (async () => {
      const [{ data: a }, { data: u }] = await Promise.all([
        supabase.from("learning_albums").select("id, title, description, cover_image_url").eq("id", albumId).maybeSingle(),
        supabase
          .from("child_updates")
          .select("id, caption, parent_summary, activity_date, child_update_media(url, kind, thumbnail_url, sort_order), students(first_name, last_name)")
          .eq("album_id", albumId)
          .order("activity_date", { ascending: false })
          .limit(100),
      ]);
      setAlbum(a);
      setUpdates(u ?? []);
      setLoading(false);
    })();
  }, [albumId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2">
            <span>{album?.title ?? "Album"}</span>
            {albumId && onAddToAlbum && (
              <Button size="sm" variant="outline" onClick={() => onAddToAlbum(albumId)}>
                <Plus className="h-4 w-4 mr-1" /> Add to album
              </Button>
            )}
          </SheetTitle>
          {album?.description && <p className="text-sm text-muted-foreground">{album.description}</p>}
        </SheetHeader>

        <div className="space-y-6 mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : updates.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No updates in this album yet.</p>
            </div>
          ) : (
            updates.map((u) => {
              const media = (u.child_update_media ?? []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              return (
                <div key={u.id} className="space-y-2 border-b pb-4 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {u.students ? `${u.students.first_name} ${u.students.last_name ?? ""}` : "Group update"}
                    </p>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />{format(new Date(u.activity_date), "d MMM yyyy")}
                    </span>
                  </div>
                  {(u.parent_summary || u.caption) && (
                    <p className="text-sm text-muted-foreground">{u.parent_summary || u.caption}</p>
                  )}
                  {media.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {media.map((m: any, i: number) => (
                        <div key={i} className="aspect-square rounded-md overflow-hidden bg-muted">
                          {m.kind === "video" ? (
                            <a href={m.url} target="_blank" rel="noreferrer" className="block h-full w-full">
                              <VideoThumb src={m.url} posterSrc={m.thumbnail_url} badgeSize="sm" />
                            </a>
                          ) : (
                            <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}