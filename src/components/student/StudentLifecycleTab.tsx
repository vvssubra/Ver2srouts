import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import StudentStatusMenu, { StatusBadge, STATUS_META, type EnrollmentStatus } from "./StudentStatusMenu";
import { History } from "lucide-react";

interface Props {
  studentId: string;
  currentStatus: EnrollmentStatus;
  statusReason?: string | null;
  statusChangedAt?: string | null;
}

export default function StudentLifecycleTab({ studentId, currentStatus, statusReason, statusChangedAt }: Props) {
  const { data: history } = useQuery({
    queryKey: ["student-status-history", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_status_history" as any)
        .select("*")
        .eq("student_id", studentId)
        .order("changed_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="text-base">Current Status</CardTitle>
              <div className="flex items-center gap-3">
                <StatusBadge status={currentStatus} />
                {statusChangedAt && (
                  <span className="text-xs text-muted-foreground">
                    since {format(new Date(statusChangedAt), "d MMM yyyy")}
                  </span>
                )}
              </div>
              {statusReason && (
                <p className="text-sm text-muted-foreground italic">"{statusReason}"</p>
              )}
            </div>
            <StudentStatusMenu studentId={studentId} currentStatus={currentStatus} variant="button" />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Lifecycle History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No status changes recorded yet.
            </p>
          ) : (
            <ol className="relative border-l-2 border-border/60 ml-3 space-y-4">
              {history.map((h: any) => {
                const toMeta = STATUS_META[h.to_status as EnrollmentStatus];
                const Icon = toMeta.icon;
                return (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2 border-primary/40">
                      <Icon className="h-2.5 w-2.5 text-primary" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      {h.from_status && <StatusBadge status={h.from_status} />}
                      <span className="text-xs text-muted-foreground">→</span>
                      <StatusBadge status={h.to_status} />
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(h.changed_at), "d MMM yyyy, h:mm a")}
                      </span>
                    </div>
                    {h.reason && (
                      <p className="text-sm text-muted-foreground mt-1.5 italic">"{h.reason}"</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}