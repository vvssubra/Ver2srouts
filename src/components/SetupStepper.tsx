import { Building2, Building, UserPlus, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STEPS = [
  { n: 1, label: "Create Organization", icon: Building2, path: "/organizations" },
  { n: 2, label: "Create Branch", icon: Building, path: "/branches" },
  { n: 3, label: "Assign Staff", icon: UserPlus, path: "/staff-management" },
];

export default function SetupStepper({ current }: { current: 1 | 2 | 3 }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <button
              onClick={() => navigate(s.path)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${
                active ? "bg-primary text-primary-foreground" : done ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                active ? "bg-primary-foreground/20" : done ? "bg-accent/20 text-accent" : "bg-muted-foreground/20"
              }`}>
                {done ? <Check className="h-3 w-3" /> : s.n}
              </span>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </div>
        );
      })}
    </div>
  );
}