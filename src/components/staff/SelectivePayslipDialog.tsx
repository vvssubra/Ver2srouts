import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Search, Users, Loader2, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StaffItem {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  basic_salary?: number;
  designation?: string;
  hasRecord?: boolean;
}

interface SelectivePayslipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffList: StaffItem[];
  monthLabel: string;
  onGenerate: (selectedIds: string[]) => void;
  isGenerating: boolean;
  progress: number;
}

export default function SelectivePayslipDialog({
  open, onOpenChange, staffList, monthLabel, onGenerate, isGenerating, progress,
}: SelectivePayslipDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [staffList, search]);

  const selectableStaff = filtered.filter(s => !s.hasRecord);
  const allSelected = selectableStaff.length > 0 && selectableStaff.every(s => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableStaff.map(s => s.id)));
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isGenerating) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Generate Payslips — {monthLabel}
          </DialogTitle>
          <DialogDescription>
            Select staff members to generate draft payslips for. Staff with existing records are marked.
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="py-6 space-y-3">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-center text-muted-foreground">
              Generating payslips... {progress}%
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              </div>
              <ScrollArea className="h-[320px] border rounded-md">
                <div className="divide-y">
                  {filtered.map(s => (
                    <label key={s.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${s.hasRecord ? "opacity-60" : ""}`}>
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={() => toggle(s.id)}
                        disabled={s.hasRecord}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.first_name} {s.last_name}</p>
                        <div className="flex items-center gap-2">
                          {s.designation && <span className="text-xs text-muted-foreground">{s.designation}</span>}
                          {s.basic_salary != null && s.basic_salary > 0 && (
                            <span className="text-xs text-muted-foreground">RM {s.basic_salary.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      {s.hasRecord && (
                        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                          <CheckCircle2 className="h-3 w-3" /> Has Record
                        </Badge>
                      )}
                      {!s.hasRecord && (!s.basic_salary || s.basic_salary <= 0) && (
                        <Badge variant="outline" className="text-[10px] text-warning border-warning/30 shrink-0">
                          No Salary
                        </Badge>
                      )}
                    </label>
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No staff found</p>
                  )}
                </div>
              </ScrollArea>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => onGenerate(Array.from(selected))} disabled={selected.size === 0}>
                Generate {selected.size} Payslip{selected.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
