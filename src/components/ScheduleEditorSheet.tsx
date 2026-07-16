import { Sheet, SheetContent } from "@/components/ui/sheet";
import TimetableTemplateConfig from "@/pages/TimetableTemplateConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  branchId: string;
}

export default function ScheduleEditorSheet({ open, onOpenChange, classId, branchId }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl lg:max-w-5xl overflow-y-auto p-4 sm:p-6"
      >
        {open && classId && branchId && (
          <TimetableTemplateConfig
            embedded
            classIdProp={classId}
            branchIdProp={branchId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}