import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserRound, GraduationCap } from "lucide-react";
import MonthlyTimetableView from "@/components/MonthlyTimetableView";

interface Props {
  teacherId: string;
  branchId: string;
  subjects: any[];
}

export default function TeacherScheduleView({ teacherId, branchId, subjects }: Props) {
  const { data: membership } = useQuery({
    queryKey: ["teacher-membership", teacherId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("assigned_class_ids")
        .eq("user_id", teacherId)
        .eq("branch_id", branchId)
        .maybeSingle();
      return data;
    },
    enabled: !!teacherId && !!branchId,
  });

  const assignedIds: string[] = (membership?.assigned_class_ids as any) ?? [];

  const { data: classes = [] } = useQuery({
    queryKey: ["teacher-classes", branchId, assignedIds.join(",")],
    queryFn: async () => {
      if (assignedIds.length === 0) return [];
      const { data } = await supabase
        .from("classes")
        .select("id, class_name, program_type")
        .in("id", assignedIds)
        .eq("is_active", true)
        .order("class_name");
      return data ?? [];
    },
    enabled: assignedIds.length > 0,
  });

  if (!membership || assignedIds.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <UserRound className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No classes assigned to this teacher</p>
          <p className="text-sm mt-1">Assign classes from the Staff module so their week shows up here.</p>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Loading classes…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        Showing this teacher's schedule across <strong className="text-foreground">{classes.length}</strong> assigned class{classes.length === 1 ? "" : "es"}. To edit, switch to <strong className="text-foreground">By Class</strong> view.
      </div>
      {classes.map((c: any) => (
        <div key={c.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm py-1 px-2">
              <GraduationCap className="h-3.5 w-3.5 mr-1.5" />
              {c.class_name}
            </Badge>
            {c.program_type && (
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.program_type}</span>
            )}
          </div>
          <MonthlyTimetableView
            classId={c.id}
            branchId={branchId}
            subjects={subjects}
            isReadOnly
          />
        </div>
      ))}
    </div>
  );
}