import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmText?: string; // Text user must type to confirm (e.g. student name)
  affectedItems?: string[]; // List of related data that will be deleted
  isPending?: boolean;
  onConfirm: () => void;
}

export default function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmText,
  affectedItems,
  isPending,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [typed, setTyped] = useState("");

  const isMatch = !confirmText || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  const handleOpenChange = (val: boolean) => {
    if (!val) setTyped("");
    onOpenChange(val);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-3">
            <span>{description}</span>

            {affectedItems && affectedItems.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 mt-2">
                <p className="text-xs font-medium text-destructive mb-1.5">The following related data will also be permanently deleted:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {affectedItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {confirmText && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs text-foreground">
                  Type <span className="font-mono font-bold text-destructive">{confirmText}</span> to confirm
                </Label>
                <Input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={confirmText}
                  className="border-destructive/40 focus-visible:ring-destructive/30"
                  autoFocus
                />
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!isMatch || isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Deleting...</>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
