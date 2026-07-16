import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface KPICardProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "info" | "destructive";
  className?: string;
  onClick?: () => void;
}

const toneMap: Record<NonNullable<KPICardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

export function KPICard({ label, value, delta, icon, tone = "default", className, onClick }: KPICardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 flex items-start justify-between gap-3 transition-shadow hover:shadow-md",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
        {delta && <p className="text-xs text-muted-foreground mt-1">{delta}</p>}
      </div>
      {icon && (
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", toneMap[tone])}>
          {icon}
        </div>
      )}
    </Card>
  );
}

export default KPICard;