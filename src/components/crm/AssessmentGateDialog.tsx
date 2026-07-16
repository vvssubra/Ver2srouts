import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childName?: string;
  onConductAssessment: () => void;
  /** Called with the chosen skip reason once the user confirms. */
  onSkipAndEnroll: (reason: string) => void;
}

const SKIP_REASONS = [
  "Parent already visited",
  "Trial not required",
  "Assessment already done manually",
  "Principal approved",
  "Sibling / returning student",
  "Urgent enrollment",
  "Other",
];

export default function AssessmentGateDialog({
  open,
  onOpenChange,
  childName,
  onConductAssessment,
  onSkipAndEnroll,
}: Props) {
  const [step, setStep] = useState<"choose" | "skip-reason">("choose");
  const [reasonKey, setReasonKey] = useState<string>("");
  const [reasonNote, setReasonNote] = useState("");

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setStep("choose");
      setReasonKey("");
      setReasonNote("");
    }
    onOpenChange(o);
  };

  const submitSkip = () => {
    const reason = reasonKey === "Other"
      ? reasonNote.trim()
      : reasonKey + (reasonNote.trim() ? ` — ${reasonNote.trim()}` : "");
    if (!reason) return;
    onSkipAndEnroll(reason);
    setStep("choose");
    setReasonKey("");
    setReasonNote("");
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {step === "choose"
              ? `Assess ${childName ?? "the child"} before enrolling?`
              : `Skip assessment for ${childName ?? "this child"}`}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            {step === "choose" ? (
              <>
                <span className="block">
                  No baseline assessment has been recorded for this child yet. A short assessment gives the
                  AI the context it needs to generate accurate lesson plans, learning goals, and methodology
                  recommendations from day one.
                </span>
                <span className="block text-foreground font-medium">
                  We strongly recommend conducting the assessment now. You can skip if needed.
                </span>
              </>
            ) : (
              <span className="block">
                Please record why the baseline assessment is being skipped. This is saved against the lead
                and shown to the academic team.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "skip-reason" && (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Select value={reasonKey} onValueChange={setReasonKey}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>
                  {SKIP_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {reasonKey === "Other" ? "Describe the reason *" : "Notes (optional)"}
              </Label>
              <Textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={2}
                placeholder={reasonKey === "Other" ? "Tell us why" : "Anything else worth noting?"}
              />
            </div>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          {step === "choose" ? (
            <>
              <AlertDialogCancel className="sm:mr-auto">Cancel</AlertDialogCancel>
              <Button variant="ghost" onClick={() => setStep("skip-reason")}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Skip & enrol
              </Button>
              <AlertDialogAction onClick={onConductAssessment}>
                <ClipboardCheck className="h-4 w-4 mr-1.5" />
                Conduct assessment
              </AlertDialogAction>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("choose")} className="sm:mr-auto">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                onClick={submitSkip}
                disabled={!reasonKey || (reasonKey === "Other" && !reasonNote.trim())}
              >
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Confirm skip & enrol
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}