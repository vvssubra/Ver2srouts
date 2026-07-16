import { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface MobileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "bottom" | "right" | "left" | "top";
}

/**
 * Mobile-friendly sheet that slides from the bottom by default.
 * Use for filter panels, quick edit forms, action menus on mobile.
 */
export function MobileSheet({ open, onOpenChange, title, description, children, side = "bottom" }: MobileSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={
          side === "bottom"
            ? "max-h-[90vh] overflow-y-auto rounded-t-2xl"
            : "overflow-y-auto"
        }
      >
        {(title || description) && (
          <SheetHeader className="text-left mb-4">
            {title && <SheetTitle>{title}</SheetTitle>}
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        {children}
      </SheetContent>
    </Sheet>
  );
}

export default MobileSheet;