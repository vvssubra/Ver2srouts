import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SmartMomentImagePreview } from "./SmartMomentImagePreview";
import {
  aspectClassFor,
  maxHeightClassFor,
  useMediaOrientation,
} from "@/lib/media/use-media-orientation";
import { cn } from "@/lib/utils";

interface Media {
  url: string;
  kind?: string | null;
  thumbnail_url?: string | null;
}

interface Props {
  media: Media[];
  onOpen?: () => void;
}

/**
 * Horizontal-snap carousel for a Moment's photos/videos.
 * - Mobile: native horizontal swipe via scroll-snap.
 * - Desktop: arrows on hover.
 * - Tap on media (no horizontal scroll happening) opens the detail dialog.
 */
export function MomentMediaCarousel({ media, onOpen }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const total = media.length;
  // Adapt frame to the first media item — portrait Learning Stories get a
  // 9:16 frame, landscape stays wide, square stays square.
  const first = media[0];
  const { orientation } = useMediaOrientation(first?.url, first?.kind, first?.thumbnail_url);
  const aspectClass = aspectClassFor(orientation);
  const maxHClass = maxHeightClassFor(orientation);
  const widthCap = orientation === "portrait" ? "max-w-[320px]" : "";

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const scrollTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  if (total === 0) return null;

  return (
    <div
      className={cn(
        "relative w-full rounded-xl overflow-hidden bg-muted mx-auto group",
        aspectClass,
        maxHClass,
        widthCap,
      )}
      onClick={(e) => {
        // Allow inner buttons to handle their own clicks
        if ((e.target as HTMLElement).closest("[data-carousel-control]")) return;
        onOpen?.();
      }}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scroll-smooth touch-pan-x touch-pan-y [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((m, i) => (
          <div key={i} className="snap-center shrink-0 w-full h-full">
            <SmartMomentImagePreview
              src={m.url}
              posterSrc={m.thumbnail_url}
              kind={m.kind}
              eager={i === 0}
              aspectClassName=""
              maxHeightClassName=""
              className="rounded-none h-full"
            />
          </div>
        ))}
      </div>

      {total > 1 && (
        <>
          {/* Counter */}
          <div
            className="absolute top-2 right-2 rounded-full bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 backdrop-blur-sm pointer-events-none"
            aria-hidden
          >
            {index + 1} / {total}
          </div>

          {/* Desktop arrows */}
          <button
            type="button"
            data-carousel-control
            onClick={(e) => { e.stopPropagation(); scrollTo(index - 1); }}
            disabled={index === 0}
            aria-label="Previous photo"
            className="hidden sm:flex absolute left-1.5 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            data-carousel-control
            onClick={(e) => { e.stopPropagation(); scrollTo(index + 1); }}
            disabled={index === total - 1}
            aria-label="Next photo"
            className="hidden sm:flex absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1 pointer-events-none">
            {media.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default MomentMediaCarousel;