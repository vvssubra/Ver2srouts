import { cn } from "@/lib/utils";
import { VideoThumb } from "./VideoThumb";

interface Props {
  src: string;
  posterSrc?: string | null;
  kind?: string | null;
  alt?: string;
  className?: string;
  /** Tailwind aspect class for the frame. Default: aspect-[4/3]. */
  aspectClassName?: string;
  /** Max-height cap for the frame. Default: max-h-[420px]. */
  maxHeightClassName?: string;
  eager?: boolean;
  onError?: () => void;
}

/**
 * SmartMomentImagePreview — shows the full photo/worksheet/video frame
 * without cropping important content. Uses a blurred copy of the same
 * image as a soft background fill so portrait shots never show plain
 * blank side bars while the foreground stays `object-contain`.
 *
 * Lightbox/detail views should keep their own `object-contain` and do
 * not need this wrapper.
 */
export function SmartMomentImagePreview({
  src,
  posterSrc,
  kind,
  alt = "",
  className,
  aspectClassName = "aspect-[4/3]",
  maxHeightClassName = "max-h-[420px]",
  eager = false,
  onError,
}: Props) {
  const isVideo = kind === "video";
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-muted rounded-xl",
        aspectClassName,
        maxHeightClassName,
        className,
      )}
    >
      {/* Blurred background fill — same source, covers the frame */}
      {!isVideo && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center blur-xl scale-110 opacity-50 select-none pointer-events-none"
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      )}

      {/* Foreground — full content, never cropped */}
      {isVideo ? (
        <div className="relative z-10 h-full w-full">
          <VideoThumb src={src} posterSrc={posterSrc} badgeSize="md" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="relative z-10 h-full w-full object-contain object-center select-none"
          draggable={false}
          onError={onError}
        />
      )}

      {/* Soft tint so the blurred backdrop never overpowers content */}
      <div className="absolute inset-0 z-20 bg-background/5 pointer-events-none" />
    </div>
  );
}

export default SmartMomentImagePreview;