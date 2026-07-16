import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

interface AreaSummary {
  area: { id: string; code: string; name_ms: string };
  assessed: number;
  total: number;
  avgScore: number;
}

interface Props {
  areaSummary: AreaSummary[];
}

export default function ProgressRadarChart({ areaSummary }: Props) {
  const radarData = areaSummary.map(({ area, avgScore }) => ({
    area: area.code,
    fullName: area.name_ms,
    score: Math.round(avgScore * 100) / 100,
    fullMark: 3,
  }));

  if (radarData.every((d) => d.score === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Competency Matrix / Matriks Kompetensi</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="area" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={30} domain={[0, 3]} tick={{ fontSize: 10 }} tickCount={4} />
              <Radar
                name="TP Score"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 text-xs text-muted-foreground mt-2">
          <span>1.0 = TP1 (Belum Menguasai)</span>
          <span>2.0 = TP2 (Menguasai)</span>
          <span>3.0 = TP3 (Melebihi)</span>
        </div>
      </CardContent>
    </Card>
  );
}
