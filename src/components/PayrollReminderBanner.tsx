import { AlertTriangle } from "lucide-react";
import { isPayrollBannerWindow } from "@/lib/ot-service";

/**
 * Shown on the 1st–6th of every month. Reminds staff to submit any pending
 * OT/Leave before the previous month's payroll is processed.
 */
export default function PayrollReminderBanner() {
  if (!isPayrollBannerWindow()) return null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex gap-3 items-start">
      <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
      <div className="text-sm text-foreground">
        <p className="font-semibold mb-0.5">
          Payroll for the previous month will be processed soon.
        </p>
        <p className="text-muted-foreground">
          Please ensure all Overtime (OT) and Leave applications have been submitted
          before payroll processing. If your OT belongs to the previous payroll period,
          it will be processed in the next payroll after approval.
        </p>
      </div>
    </div>
  );
}