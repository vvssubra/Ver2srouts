import { useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { deriveVideoThumbnailUrl, withVideoFrameHint } from "@/lib/media/video-thumbnail";

interface Props {
  src: string;
  posterSrc?: string | null;
  className?: string;
  badgeSize?: "sm" | "md";
}

/**
 * VideoThumb — lightweight poster-frame renderer for moment videos.
 *
 * iOS Safari / Chrome won't paint a first frame for <video preload="metadata">
 * unless the URL hints a time offset. We append #t=0.1 AND seek to 0.1s once
 * metadata is available so a real frame shows instead of a black box, while
 * keeping preload="metadata" so the full file is never downloaded for a thumb.
 */
export function VideoThumb({ src, posterSrc, className, badgeSize = "md" }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const videoSrc = withVideoFrameHint(src);
  const resolvedPoster = useMemo(() => posterSrc || deriveVideoThumbnailUrl(src), [posterSrc, src]);
  const showPoster = !!resolvedPoster && !posterFailed;

  const handleLoadedMetadata = () => {
    const el = ref.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
    }
    try {
      if (el.currentTime < 0.1) el.currentTime = 0.1;
    } catch {
      // ignore
    }
  };

  const handleVideoReady = () => setVideoReady(true);

  const badgePx = badgeSize === "sm" ? "h-10 w-10" : "h-14 w-14";
  const iconPx = badgeSize === "sm" ? "h-5 w-5" : "h-7 w-7";

  const formatDuration = (s: number) => {
    const total = Math.round(s);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-black", className)}>
      {showPoster && (
        <>
          {/* Blurred backdrop fills the frame so portrait videos don't leave bars */}
          <img
            src={resolvedPoster}
            alt=""
            aria-hidden
            className="absolute inset-0 z-0 h-full w-full object-cover scale-110 blur-xl opacity-60"
            loading="eager"
            decoding="async"
            draggable={false}
          />
          {/* Actual poster, fully contained so faces are never cropped */}
          <img
            src={resolvedPoster}
            alt=""
            className="absolute inset-0 z-10 h-full w-full object-contain"
            loading="eager"
            decoding="async"
            draggable={false}
            onError={() => setPosterFailed(true)}
          />
        </>
      )}
      <video
        ref={ref}
        src={videoSrc}
        className={cn(
          "h-full w-full object-contain pointer-events-none transition-opacity",
          showPoster || !videoReady ? "opacity-0" : "opacity-100",
        )}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleVideoReady}
        onCanPlay={handleVideoReady}
      />
      {!showPoster && !videoReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5" aria-hidden>
          <div className="h-10 w-10 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className={cn("flex items-center justify-center rounded-full bg-foreground/55 text-background backdrop-blur-sm shadow", badgePx)}>
          <Play className={cn("fill-current", iconPx)} />
        </div>
      </div>
      {duration !== null && (
        <div className="absolute z-30 bottom-2 right-2 rounded-md bg-black/65 text-white text-[10px] font-medium px-1.5 py-0.5 backdrop-blur-sm pointer-events-none">
          {formatDuration(duration)}
        </div>
      )}
    </div>
  );
}

export default VideoThumb;