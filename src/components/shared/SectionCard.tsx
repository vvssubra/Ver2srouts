import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({ title, description, actions, children, className, bodyClassName }: SectionCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
          <div className="min-w-0">
            {title && <CardTitle className="text-base sm:text-lg">{title}</CardTitle>}
            {description && <CardDescription className="text-xs sm:text-sm mt-1">{description}</CardDescription>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

export default SectionCard;