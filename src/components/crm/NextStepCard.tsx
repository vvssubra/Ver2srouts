import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle, Mail, Calendar as CalendarIcon, ClipboardCheck,
  CheckCircle2, ArrowRight, Sparkles, GraduationCap,
} from "lucide-react";
import ScheduleVisitForm, { type VisitType } from "./ScheduleVisitForm";

interface NextStepCardProps {
  lead: any;
  isEnrolling: boolean;
  isSchedulingVisit: boolean;
  onMarkContacted: () => void;
  onScheduleVisit: (params: { type: VisitType; date: Date; time: string; notes: string }) => void;
  onEnroll: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onStartAssessment: () => void;
  onMoveToWaitlist: () => void;
}

export default function NextStepCard({
  lead, isEnrolling, isSchedulingVisit,
  onMarkContacted, onScheduleVisit, onEnroll,
  onWhatsApp, onEmail, onStartAssessment, onMoveToWaitlist,
}: NextStepCardProps) {
  const status = lead.status as string;

  const renderContent = () => {
    switch (status) {
      case "new":
        return (
          <>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Reach out to the parent</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Make first contact via WhatsApp or email, then mark as contacted.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {lead.phone && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onWhatsApp}>
                  <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                </Button>
              )}
              {lead.email && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onEmail}>
                  <Mail className="h-3.5 w-3.5" />Email
                </Button>
              )}
            </div>
            <Button size="sm" className="w-full gap-1.5" onClick={onMarkContacted}>
              <CheckCircle2 className="h-3.5 w-3.5" />Mark as Contacted
            </Button>
          </>
        );
      case "contacted":
        return (
          <>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Schedule a school visit</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Invite the parent for a tour or trial session.
            </p>
            <ScheduleVisitForm
              isPending={isSchedulingVisit}
              onSubmit={onScheduleVisit}
            />
          </>
        );
      case "tour_scheduled":
      case "trial_scheduled":
        return (
          <>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">
                Awaiting {status === "trial_scheduled" ? "trial" : "tour"} outcome
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Mark the outcome from the Scheduled Visits section below once complete.
            </p>
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onStartAssessment}>
              <ClipboardCheck className="h-3.5 w-3.5" />Start Baseline Assessment
            </Button>
            <Button size="sm" variant="ghost" className="w-full gap-1.5" onClick={onMoveToWaitlist}>
              Move to Waitlist
            </Button>
          </>
        );
      case "waitlisted":
        return (
          <>
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Ready to enroll</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Move this lead to enrollment when a class spot opens up.
            </p>
            {lead.pre_enrollment_assessment ? (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1">
                ✓ Baseline assessment recorded — AI will personalise lesson plans from day one.
              </p>
            ) : (
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onStartAssessment}>
                <ClipboardCheck className="h-3.5 w-3.5" />Conduct Baseline Assessment
              </Button>
            )}
            <Button size="sm" className="w-full gap-1.5" onClick={onEnroll} disabled={isEnrolling}>
              {isEnrolling ? "Enrolling..." : (<><GraduationCap className="h-3.5 w-3.5" />Enroll Student</>)}
            </Button>
          </>
        );
      case "enrolled":
        return (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
              <p className="text-sm font-semibold">Enrolled 🎉</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {lead.child_name} is now an active student. Manage them from the Students page.
            </p>
          </>
        );
      default:
        return null;
    }
  };

  const tone =
    status === "enrolled"
      ? "border-accent/40 bg-accent/5"
      : "border-primary/30 bg-primary/5";

  return (
    <Card className={tone}>
      <CardContent className="p-4 space-y-3">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Next Step</Badge>
        {renderContent()}
      </CardContent>
    </Card>
  );
}