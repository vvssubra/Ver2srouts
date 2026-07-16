import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface WheelArea {
  id: string;
  code: string;
  name?: string;
  assessed: number;
  total: number;
  avgScore?: number; // 0-3
}

interface Props {
  areas: WheelArea[];
  size?: number;
}

// Pleasant, distinct hues for up to ~10 areas.
const ARC_COLORS = [
  "hsl(142 70% 45%)", // green
  "hsl(199 89% 48%)", // sky
  "hsl(38 92% 50%)",  // amber
  "hsl(280 65% 55%)", // violet
  "hsl(340 75% 55%)", // pink
  "hsl(173 65% 42%)", // teal
  "hsl(20 90% 55%)",  // orange
  "hsl(220 70% 55%)", // blue
  "hsl(95 55% 45%)",  // olive
  "hsl(260 60% 60%)", // indigo
];

/**
 * Radial "Development Wheel" – pure SVG, no chart deps.
 * Each area gets its own concentric ring; the ring fills proportionally
 * to assessed/total. Empty areas render as a thin dashed grey ring.
 */
export function DevelopmentWheel({ areas, size = 240 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const totalAssessed = areas.reduce((s, a) => s + a.assessed, 0);
  const totalStandards = areas.reduce((s, a) => s + a.total, 0);

  const cx = size / 2;
  const cy = size / 2;
  const stroke = 9;
  const gap = 5;
  const outerR = size / 2 - stroke / 2 - 2;
  const innerLimit = 42; // keep room for the center label

  // Distribute rings between outerR and innerLimit. Guarantee at least
  // one stroke + one gap of separation so every ring is visually distinct
  // even at 7+ areas (previously they compressed together at small sizes).
  const ringCount = Math.max(areas.length, 1);
  const span = outerR - innerLimit;
  const ringStep = Math.max(stroke + gap * 0.5, Math.min(stroke + gap, span / ringCount));

  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Development progress: ${totalAssessed} of ${totalStandards} skills assessed across ${areas.length} areas`}
        className="overflow-visible"
      >
        {areas.map((a, i) => {
          const r = outerR - i * ringStep;
          if (r < innerLimit) return null;
          const circumference = 2 * Math.PI * r;
          const pct = a.total > 0 ? Math.min(1, a.assessed / a.total) : 0;
          const dashOn = mounted ? circumference * pct : 0;
          const color = a.assessed === 0 ? "hsl(var(--muted-foreground) / 0.25)" : ARC_COLORS[i % ARC_COLORS.length];
          const pctLabel = a.total > 0 ? Math.round((a.assessed / a.total) * 100) : 0;
          const tipTitle = a.name ? `${a.code} · ${a.name}` : a.code;
          const tipBody = `${a.assessed} of ${a.total} skills assessed (${pctLabel}%)`;
          return (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <g style={{ cursor: "pointer" }}>
                  {/* hover hit area */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={stroke + gap}
                    style={{ pointerEvents: "stroke" }}
                  />
                  {/* track */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth={stroke}
                    opacity={0.5}
                  />
                  {/* progress arc */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={a.assessed === 0 ? 2 : stroke}
                    strokeLinecap="round"
                    strokeDasharray={
                      a.assessed === 0
                        ? "2 6"
                        : `${dashOn} ${circumference - dashOn}`
                    }
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                  />
                </g>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
                  <span className="font-semibold text-xs">{tipTitle}</span>
                </div>
                <div className="text-xs text-muted-foreground">{tipBody}</div>
                <div className="text-[10px] text-muted-foreground mt-1 italic">Developmental area</div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {totalAssessed}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          of {totalStandards}
        </text>
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" }}
        >
          Skills tracked
        </text>
      </svg>

      {/* Legend */}
      <p className="text-[11px] text-muted-foreground mt-3 text-center max-w-md">
        Each ring is one developmental area your school tracks. The filled portion shows how many skills your teacher has observed so far. Tap a ring for details.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full max-w-md">
        {areas.map((a, i) => {
          const color = a.assessed === 0 ? "hsl(var(--muted-foreground) / 0.4)" : ARC_COLORS[i % ARC_COLORS.length];
          const pct = a.total > 0 ? Math.round((a.assessed / a.total) * 100) : 0;
          return (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-xs cursor-help">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="font-medium text-foreground truncate">
                    {a.name || a.code}
                  </span>
                  <span className="text-muted-foreground tabular-nums ml-auto shrink-0">
                    {a.assessed}/{a.total} · {pct}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <div className="font-semibold text-xs">{a.name ? `${a.code} · ${a.name}` : a.code}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.assessed} of {a.total} skills assessed ({pct}%)
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 italic">Developmental area</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
    </TooltipProvider>
  );
}

export default DevelopmentWheel;