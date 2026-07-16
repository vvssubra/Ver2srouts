import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface QuickActionCardProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
  className?: string;
  tone?: "default" | "warm" | "info" | "success";
}

const toneMap: Record<NonNullable<QuickActionCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  warm:    "bg-warning/15 text-warning",
  info:    "bg-info/10 text-info",
  success: "bg-success/10 text-success",
};

export function QuickActionCard({ icon, title, description, onClick, className, tone = "default" }: QuickActionCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group",
        className,
      )}
    >
      <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", toneMap[tone])}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-foreground truncate">{title}</p>
        {description && <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
    </Card>
  );
}

export default QuickActionCard;