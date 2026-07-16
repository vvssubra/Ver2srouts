import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResponsiveFormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Two-column form section that stacks on mobile.
 * Left: title + description. Right: form fields.
 */
export function ResponsiveFormSection({ title, description, children, className }: ResponsiveFormSectionProps) {
  return (
    <section className={cn("grid gap-4 md:grid-cols-3 md:gap-8 py-6 border-b border-border/60 last:border-0", className)}>
      <div className="md:col-span-1">
        {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="md:col-span-2 space-y-4">{children}</div>
    </section>
  );
}

export default ResponsiveFormSection;