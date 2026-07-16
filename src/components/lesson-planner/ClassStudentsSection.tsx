import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Eye, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  classId: string;
}

export default function ClassStudentsSection({ classId }: Props) {
  const navigate = useNavigate();

  const { data: students } = useQuery({
    queryKey: ["class-students-for-plan", classId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, photo_url")
        .eq("class_id", classId)
        .eq("is_active", true)
        .order("first_name");
      return data ?? [];
    },
    enabled: !!classId,
  });

  const { data: obsCounts } = useQuery({
    queryKey: ["class-student-obs-counts", classId],
    queryFn: async () => {
      if (!students?.length) return {};
      const ids = students.map((s: any) => s.id);
      const { data } = await supabase
        .from("student_observations")
        .select("student_id")
        .in("student_id", ids);
      const counts: Record<string, number> = {};
      data?.forEach((o: any) => {
        counts[o.student_id] = (counts[o.student_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!students?.length,
  });

  if (!students?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          Class Students ({students.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {students.map((s: any) => {
            const count = obsCounts?.[s.id] || 0;
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/students/${s.id}`)}
              >
                {s.photo_url ? (
                  <img src={s.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                    {s.first_name?.[0]}{s.last_name?.[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
