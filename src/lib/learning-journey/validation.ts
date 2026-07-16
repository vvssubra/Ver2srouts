/**
 * Learning Journey upload validation.
 * Centralises minimum-quality guardrails so the New Update sheet and any
 * future bulk-uploaders share the same rules.
 */

export const MIN_VIDEO_SECONDS = 10;
export const MIN_OBSERVATION_CHARS = 60;

// Vague / low-signal phrases that don't describe what the child actually did.
// Used only as a soft warning so teachers strengthen the parent message; we
// don't block posting on this alone.
export const WEAK_PHRASES = [
  "nice",
  "good job",
  "well done",
  "great",
  "lovely",
  "cute",
  "happy",
  "fun day",
  "amazing",
  "awesome",
  "so cute",
  "had fun",
];

export function findWeakPhrases(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return WEAK_PHRASES.filter((w) => {
    const re = new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  });
}

/** Probe an HTML5-compatible video file and return its duration in seconds. */
export function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = url;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        v.src = "";
      };
      v.onloadedmetadata = () => {
        const d = Number.isFinite(v.duration) ? v.duration : 0;
        cleanup();
        resolve(d);
      };
      v.onerror = () => {
        cleanup();
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

export interface PrePublishInput {
  share: boolean;
  tracksProgress: boolean;
  parentSummary: string;
  caption: string;
  skillCount: number;
  hasDomainTagged: boolean;
  hasMedia: boolean;
  shortVideoCount: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  /** When true, posting is blocked until satisfied (only enforced on share). */
  required: boolean;
  hint?: string;
}

export function buildChecklist(input: PrePublishInput): ChecklistItem[] {
  const observation = (input.parentSummary || "").trim();
  const weak = findWeakPhrases(`${input.caption} ${observation}`);
  return [
    {
      id: "media-or-note",
      label: "Photo, video, or short note added",
      ok: input.hasMedia || (input.caption || "").trim().length > 0,
      required: true,
    },
    {
      id: "video-length",
      label: `Videos are at least ${MIN_VIDEO_SECONDS} seconds`,
      ok: input.shortVideoCount === 0,
      required: true,
      hint:
        input.shortVideoCount > 0
          ? `${input.shortVideoCount} video${input.shortVideoCount > 1 ? "s" : ""} below ${MIN_VIDEO_SECONDS}s — capture a longer clip so the moment tells a story.`
          : undefined,
    },
    {
      id: "observation-length",
      label: `Parent message is meaningful (≥ ${MIN_OBSERVATION_CHARS} characters)`,
      ok: !input.tracksProgress || observation.length >= MIN_OBSERVATION_CHARS,
      required: input.tracksProgress,
      hint:
        input.tracksProgress && observation.length < MIN_OBSERVATION_CHARS
          ? `Describe what the child did and what it shows (${observation.length}/${MIN_OBSERVATION_CHARS}).`
          : undefined,
    },
    {
      id: "domain",
      label: "Development area + at least one skill tagged",
      ok: !input.tracksProgress || (input.skillCount > 0 && input.hasDomainTagged),
      required: input.tracksProgress,
    },
    {
      id: "strong-language",
      label: "Specific language (no vague praise like 'nice', 'good job')",
      ok: weak.length === 0,
      required: false,
      hint: weak.length > 0 ? `Consider replacing: ${weak.slice(0, 4).join(", ")}` : undefined,
    },
  ];
}

export function blockingFailures(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.required && !i.ok);
}