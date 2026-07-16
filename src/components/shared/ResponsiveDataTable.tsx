import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a <table> so it scrolls horizontally on small screens without
 * breaking the page layout. Pair with a sticky header for premium feel.
 */
export function ResponsiveDataTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto -mx-4 sm:mx-0 rounded-none sm:rounded-lg border-y sm:border", className)}>
      <div className="min-w-full inline-block align-middle">{children}</div>
    </div>
  );
}

export default ResponsiveDataTable;