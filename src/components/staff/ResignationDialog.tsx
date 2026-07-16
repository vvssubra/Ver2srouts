import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, FileText, Upload } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface ResignationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName: string;
  onConfirm: (data: { status: string; lastWorkingDate: string; letterFile: File }) => void;
  isPending: boolean;
}

const MAX_LETTER_BYTES = 10 * 1024 * 1024;

export default function ResignationDialog({ open, onOpenChange, staffName, onConfirm, isPending }: ResignationDialogProps) {
  const [status, setStatus] = useState("resigned");
  const [lastWorkingDate, setLastWorkingDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [letterFile, setLetterFile] = useState<File | null>(null);

  const handleFile = (f: File | null) => {
    if (!f) { setLetterFile(null); return; }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF only", description: "The resignation letter must be a PDF file.", variant: "destructive" });
      return;
    }
    if (f.size > MAX_LETTER_BYTES) {
      toast({ title: "File too large", description: "Maximum resignation letter size is 10 MB.", variant: "destructive" });
      return;
    }
    setLetterFile(f);
  };

  const handleConfirm = () => {
    if (!letterFile) {
      toast({ title: "Resignation letter required", description: "Please upload the signed resignation letter (PDF) to continue.", variant: "destructive" });
      return;
    }
    onConfirm({ status, lastWorkingDate, letterFile });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Process Separation
          </DialogTitle>
          <DialogDescription>
            Process separation for <strong>{staffName}</strong>. This will deactivate the staff member and exclude them from payroll.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Separation Type</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="on_notice">On Notice Period</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Last Working Date</Label>
            <Input type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Used for final payroll and access cut-off.</p>
          </div>
          <div>
            <Label>Resignation Letter <span className="text-destructive">*</span></Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {letterFile ? (
              <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate flex-1">{letterFile.name}</span>
                <span className="text-muted-foreground">{(letterFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                PDF only, max 10 MB. Letter is stored permanently for payroll verification and audit.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending || !lastWorkingDate || !letterFile}>
            {isPending ? "Processing..." : "Confirm Separation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
