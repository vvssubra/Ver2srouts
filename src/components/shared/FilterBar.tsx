import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

/** Responsive wrapping filter row: wraps on mobile, single line on desktop. */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>
      {children}
    </div>
  );
}

export default FilterBar;