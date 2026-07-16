import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { filterNavEntries } from "@/components/nav-filter";
import { isGroup, isSubGroup, type NavEntry } from "@/components/DashboardLayout";

type Entry = { label: string; path: string; group: string; keywords: string };

// Extra synonyms so partial searches like "OT", "Leave", "Pay" find related pages.
const SYNONYMS: Record<string, string[]> = {
  "/overtime": ["ot", "ot request", "overtime request", "ot approval", "ot history"],
  "/leave": ["leave application", "leave request", "leave management", "annual leave"],
  "/payroll": ["payroll", "payslip", "salary", "wages"],
  "/my-payslips": ["payslip", "my salary", "my payroll"],
  "/staff-attendance": ["clock in", "clock out", "staff attendance"],
  "/attendance": ["student attendance", "check in", "check out"],
  "/claims": ["reimbursement", "expense claim"],
  "/users": ["roles", "permissions", "user management", "access groups"],
  "/staff-management": ["staff", "employee", "hr staff", "parent management"],
  "/students": ["parent management", "student directory"],
  "/notifications": ["alerts", "inbox"],
  "/settings": ["preferences", "system settings"],
};

function buildEntries(nav: NavEntry[]): Entry[] {
  const out: Entry[] = [];
  const push = (label: string, path: string, group: string) => {
    out.push({
      label,
      path,
      group,
      keywords: [label, group, path, ...(SYNONYMS[path] ?? [])].join(" ").toLowerCase(),
    });
  };
  for (const entry of nav) {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        if (isSubGroup(item)) {
          for (const sub of item.items) {
            push(sub.label, sub.path, `${entry.group} → ${item.subGroup}`);
          }
        } else {
          push(item.label, item.path, entry.group);
        }
      }
    } else {
      push(entry.label, entry.path, entry.label);
    }
  }
  return out;
}

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { role, allowedRoutes } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () => buildEntries(filterNavEntries(role, allowedRoutes ?? [])),
    [role, allowedRoutes],
  );

  // Cmd/Ctrl + K to focus the bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matched = q
      ? entries.filter((e) => q.split(/\s+/).every((t) => e.keywords.includes(t)))
      : [];
    const byGroup = new Map<string, Entry[]>();
    for (const e of matched.slice(0, 40)) {
      if (!byGroup.has(e.group)) byGroup.set(e.group, []);
      byGroup.get(e.group)!.push(e);
    }
    return [...byGroup.entries()];
  }, [value, entries]);

  const go = (path: string) => {
    setOpen(false);
    setValue("");
    navigate(path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
            "w-full max-w-md",
            className,
          )}
          aria-label="Search the app"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search modules, pages, requests…</span>
          <kbd className="hidden md:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(560px,90vw)] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            placeholder="Try “OT”, “Leave”, “Payroll”, “Attendance”…"
            value={value}
            onValueChange={setValue}
          />
          <CommandList className="max-h-[380px]">
            {value.trim() === "" ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Start typing to search modules, pages, requests, reports and settings.
              </div>
            ) : grouped.length === 0 ? (
              <CommandEmpty>No matching pages.</CommandEmpty>
            ) : (
              grouped.map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((it) => (
                    <CommandItem
                      key={`${group}:${it.path}:${it.label}`}
                      value={`${group} ${it.label} ${it.path}`}
                      onSelect={() => go(it.path)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-sm font-medium">{it.label}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {group} → {it.label}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default GlobalSearch;