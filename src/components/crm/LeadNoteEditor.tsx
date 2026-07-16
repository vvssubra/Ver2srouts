import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
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

const NOTE_WORD_LIMIT = 50;
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clampToWords = (s: string, limit: number) => {
  const parts = s.split(/(\s+)/);
  let words = 0;
  const out: string[] = [];
  for (const p of parts) {
    if (/^\s+$/.test(p)) { out.push(p); continue; }
    if (p === "") continue;
    if (words >= limit) break;
    out.push(p);
    words++;
  }
  return out.join("");
};

interface LeadNoteEditorProps {
  lead: any;
  canEdit: boolean;
  onSave: (note: string) => Promise<any> | any;
}

/**
 * Kanban note editor for the Lead Details sheet. Shares the same
 * `kanban_note` field as LeadCard so both surfaces stay in sync.
 */
export default function LeadNoteEditor({ lead, canEdit, onSave }: LeadNoteEditorProps) {
  const note: string = lead?.kanban_note || "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(note);
  }, [note, editing]);

  const draftWords = countWords(draft);
  const overLimit = draftWords > NOTE_WORD_LIMIT;

  const handleSave = async () => {
    if (overLimit) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onSave("");
      setConfirmDelete(false);
      setEditing(false);
      setDraft("");
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            if (countWords(next) > NOTE_WORD_LIMIT) {
              setDraft(clampToWords(next, NOTE_WORD_LIMIT));
            } else {
              setDraft(next);
            }
          }}
          rows={3}
          placeholder="Add a short note (max 50 words)"
          className="text-sm resize-none"
        />
        <div className="flex items-center justify-between">
          <span className={cn("text-[11px] tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
            {draftWords}/{NOTE_WORD_LIMIT} words
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => { setDraft(note); setEditing(false); }}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={handleSave}
              disabled={saving || overLimit}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (note) {
    return (
      <>
        <div className="rounded-md border bg-yellow-100/80 border-yellow-300/70 dark:bg-yellow-500/10 dark:border-yellow-500/30 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <StickyNote className="h-3.5 w-3.5 mt-0.5 text-yellow-700 dark:text-yellow-300 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-yellow-800/80 dark:text-yellow-200/80 mb-1">Note</p>
                <p className="text-sm text-yellow-900 dark:text-yellow-100 whitespace-pre-wrap break-words">{note}</p>
              </div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200/60 dark:hover:bg-yellow-500/20"
                  title="Edit note"
                  onClick={() => { setDraft(note); setEditing(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  title="Delete note"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => { e.preventDefault(); handleDelete(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (!canEdit) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      onClick={() => { setDraft(""); setEditing(true); }}
    >
      <StickyNote className="h-3.5 w-3.5 mr-1.5" />
      Add note
    </Button>
  );
}