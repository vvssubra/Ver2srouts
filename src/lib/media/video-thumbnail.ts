const THUMB_SUFFIX = "-thumb.jpg";

export function buildVideoThumbnailPath(videoPath: string) {
  const dot = videoPath.lastIndexOf(".");
  if (dot <= videoPath.lastIndexOf("/")) return `${videoPath}${THUMB_SUFFIX}`;
  return `${videoPath.slice(0, dot)}${THUMB_SUFFIX}`;
}

export function deriveVideoThumbnailUrl(videoUrl: string) {
  if (!videoUrl) return null;
  const [withoutHash] = videoUrl.split("#");
  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : "";
  const slash = base.lastIndexOf("/");
  const dot = base.lastIndexOf(".");
  const thumbBase = dot > slash ? `${base.slice(0, dot)}${THUMB_SUFFIX}` : `${base}${THUMB_SUFFIX}`;
  return `${thumbBase}${query}`;
}

export function withVideoFrameHint(videoUrl: string, seconds = 0.1) {
  return videoUrl.includes("#") ? videoUrl : `${videoUrl}#t=${seconds}`;
}

export async function createVideoThumbnailFile(file: File, fileName = "video-thumb.jpg") {
  if (!file.type.startsWith("video/")) return null;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("Could not create video thumbnail"));
      };
      const timer = window.setTimeout(fail, 7000);

      video.addEventListener("loadedmetadata", () => {
        const seekTo = Number.isFinite(video.duration) && video.duration > 0.25 ? 0.1 : 0;
        try {
          video.currentTime = seekTo;
          if (seekTo === 0) finish();
        } catch {
          finish();
        }
      }, { once: true });
      video.addEventListener("loadeddata", () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0.25) finish();
      }, { once: true });
      video.addEventListener("seeked", finish, { once: true });
      video.addEventListener("error", fail, { once: true });

      video.src = objectUrl;
      video.load();
    });

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob) return null;
    return new File([blob], fileName, { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}