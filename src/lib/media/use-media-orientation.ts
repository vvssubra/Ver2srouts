import { useEffect, useState } from "react";

export type MediaOrientation = "portrait" | "landscape" | "square";

/**
 * Probe the natural dimensions of an image or video URL so the feed can
 * pick an adaptive frame (9:16 for portrait, 16:10 for landscape, 1:1 for
 * square). Falls back to `landscape` while loading so the layout stays
 * stable on first paint.
 */
export function useMediaOrientation(
  src: string | null | undefined,
  kind: string | null | undefined,
  posterSrc?: string | null,
): { orientation: MediaOrientation; ratio: number | null } {
  const [state, setState] = useState<{ orientation: MediaOrientation; ratio: number | null }>(
    { orientation: "landscape", ratio: null },
  );

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    const apply = (w: number, h: number) => {
      if (cancelled || !w || !h) return;
      const ratio = w / h;
      const orientation: MediaOrientation =
        ratio < 0.95 ? "portrait" : ratio > 1.15 ? "landscape" : "square";
      setState({ orientation, ratio });
    };

    const probeImage = (url: string) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => apply(img.naturalWidth, img.naturalHeight);
      img.src = url;
    };

    if (kind === "video") {
      if (posterSrc) {
        probeImage(posterSrc);
        return () => {
          cancelled = true;
        };
      }
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      v.onloadedmetadata = () => apply(v.videoWidth, v.videoHeight);
      v.src = src;
    } else {
      probeImage(src);
    }

    return () => {
      cancelled = true;
    };
  }, [src, kind, posterSrc]);

  return state;
}

export function aspectClassFor(orientation: MediaOrientation): string {
  switch (orientation) {
    case "portrait":
      return "aspect-[9/16]";
    case "square":
      return "aspect-square";
    default:
      return "aspect-[16/10]";
  }
}

export function maxHeightClassFor(orientation: MediaOrientation): string {
  // Portrait Learning Stories shouldn't take over the feed on tall phones.
  return orientation === "portrait" ? "max-h-[560px]" : "max-h-[420px]";
}