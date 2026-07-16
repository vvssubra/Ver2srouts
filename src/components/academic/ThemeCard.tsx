import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WeeklyFocus {
  id: string;
  week_number: number;
  focus_title: string;
  focus_description?: string;
  key_questions?: string[];
}

interface ThemeCardProps {
  theme: {
    id: string;
    theme_name: string;
    month_number: number;
    big_idea?: string;
    key_vocabulary?: string[];
    key_concepts?: string[];
  };
  weeklyFocuses: WeeklyFocus[];
  onClick?: () => void;
  selected?: boolean;
}

const MONTH_COLORS = [
  "from-rose-500 to-pink-600",
  "from-orange-500 to-amber-600",
  "from-yellow-500 to-orange-500",
  "from-emerald-500 to-green-600",
  "from-teal-500 to-cyan-600",
  "from-sky-500 to-blue-600",
  "from-indigo-500 to-violet-600",
  "from-purple-500 to-fuchsia-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-teal-600",
  "from-amber-500 to-yellow-600",
  "from-green-500 to-emerald-600",
];

export default function ThemeCard({ theme, weeklyFocuses, onClick, selected }: ThemeCardProps) {
  const gradient = MONTH_COLORS[(theme.month_number - 1) % 12];

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
    >
      <div className={`h-2 rounded-t-lg bg-gradient-to-r ${gradient}`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs">Month {theme.month_number}</Badge>
          {theme.key_vocabulary && theme.key_vocabulary.length > 0 && (
            <Badge variant="secondary" className="text-xs">{theme.key_vocabulary.length} vocab</Badge>
          )}
        </div>
        <CardTitle className="text-lg">{theme.theme_name}</CardTitle>
        {theme.big_idea && (
          <p className="text-sm text-muted-foreground italic">"{theme.big_idea}"</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Weekly Focuses */}
        <div className="space-y-1.5">
          {weeklyFocuses.map((wf) => (
            <div key={wf.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">W{wf.week_number}</span>
              <span className="truncate">{wf.focus_title}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
