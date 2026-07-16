import { Badge } from "@/components/ui/badge";

const DOMAIN_COLORS: Record<string, string> = {
  CL: "bg-blue-500",
  EL: "bg-purple-500",
  NT: "bg-amber-500",
  PM: "bg-green-500",
  SE: "bg-pink-500",
  CD: "bg-orange-500",
  VC: "bg-teal-500",
};

interface DomainCoverageBarProps {
  domains: { code: string; name: string; count: number }[];
  total: number;
}

export default function DomainCoverageBar({ domains, total }: DomainCoverageBarProps) {
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {domains.map((d) => {
          const pct = (d.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={d.code}
              className={`${DOMAIN_COLORS[d.code] || "bg-primary"} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${d.name}: ${d.count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {domains.filter(d => d.count > 0).map((d) => (
          <Badge key={d.code} variant="outline" className="text-xs gap-1">
            <span className={`h-2 w-2 rounded-full ${DOMAIN_COLORS[d.code] || "bg-primary"}`} />
            {d.code}: {d.count}
          </Badge>
        ))}
      </div>
    </div>
  );
}
