import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Play, ChevronDown, ChevronUp, Sparkles, User } from "lucide-react";
import { VideoThumb } from "@/components/daily-updates/VideoThumb";

export interface EvidenceMedia {
  media_url: string;
  media_type?: string | null;
  caption?: string | null;
  sort_order?: number | null;
}

export interface EvidenceObservation {
  id: string;
  observed_at: string;
  notes?: string | null;
  ai_learning_story?: string | null;
  media_url?: string | null;
  evidence_url?: string | null;
  proficiency_level?: string | null;
  observer_name?: string | null;
  media: EvidenceMedia[];
}

const proficiencyLabel: Record<string, string> = {
  TP1: "🌱 Building",
  TP2: "🌿 Growing",
  TP3: "🌳 Confident",
};

function classify(url: string, hintType?: string | null): "image" | "video" | "pdf" | "file" {
  const u = url.toLowerCase();
  if (hintType === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
  if (hintType === "pdf" || u.endsWith(".pdf")) return "pdf";
  if (hintType === "image" || /\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/.test(u)) return "image";
  return "file";
}

function MediaTile({ url, type, caption }: { url: string; type: ReturnType<typeof classify>; caption?: string | null }) {
  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden bg-muted">
        <img src={url} alt={caption ?? "evidence"} loading="lazy" className="h-full w-full object-cover" />
      </a>
    );
  }
  if (type === "video") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden bg-muted">
        <VideoThumb src={url} badgeSize="sm" />
      </a>
    );
  }
  if (type === "pdf") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs hover:bg-muted">
        <FileText className="h-4 w-4 text-destructive" />
        <span className="truncate">{caption || "Worksheet / PDF"}</span>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs hover:bg-muted">
      <Play className="h-4 w-4" />
      <span className="truncate">Open file</span>
    </a>
  );
}

export default function ObservationEvidence({ observations }: { observations: EvidenceObservation[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!observations || observations.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No teacher notes or evidence shared yet.</p>;
  }
  const visible = showAll ? observations : observations.slice(0, 3);
  return (
    <div className="space-y-3">
      {visible.map((o) => {
        const story = o.ai_learning_story || o.notes;
        const all: EvidenceMedia[] = [
          ...(o.media_url ? [{ media_url: o.media_url, media_type: "image" }] : []),
          ...(o.evidence_url ? [{ media_url: o.evidence_url, media_type: null }] : []),
          ...(o.media ?? []),
        ];
        // dedupe by url
        const seen = new Set<string>();
        const merged = all.filter((m) => {
          if (!m.media_url || seen.has(m.media_url)) return false;
          seen.add(m.media_url);
          return true;
        });
        const tiles = merged.map((m) => ({ ...m, type: classify(m.media_url, m.media_type) }));
        const grid = tiles.filter((t) => t.type === "image" || t.type === "video");
        const docs = tiles.filter((t) => t.type === "pdf" || t.type === "file");
        return (
          <div key={o.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{o.observer_name || "Teacher"}</span>
                <span>·</span>
                <span>{format(new Date(o.observed_at), "d MMM yyyy")}</span>
              </div>
              {o.proficiency_level && (
                <Badge variant="outline" className="text-[10px]">
                  {proficiencyLabel[o.proficiency_level] || o.proficiency_level}
                </Badge>
              )}
            </div>
            {story && (
              <div className="flex gap-1.5 text-sm leading-relaxed text-foreground/90">
                <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="whitespace-pre-wrap">{story}</p>
              </div>
            )}
            {grid.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {grid.map((t, i) => (
                  <MediaTile key={`${t.media_url}-${i}`} url={t.media_url} type={t.type as any} caption={t.caption} />
                ))}
              </div>
            )}
            {docs.length > 0 && (
              <div className="space-y-1.5">
                {docs.map((t, i) => (
                  <MediaTile key={`${t.media_url}-${i}`} url={t.media_url} type={t.type as any} caption={t.caption} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {observations.length > 3 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? (
            <><ChevronUp className="h-3 w-3 mr-1" /> Show recent only</>
          ) : (
            <><ChevronDown className="h-3 w-3 mr-1" /> Show {observations.length - 3} older observation{observations.length - 3 === 1 ? "" : "s"}</>
          )}
        </Button>
      )}
    </div>
  );
}