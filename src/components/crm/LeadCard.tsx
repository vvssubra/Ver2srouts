import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Calendar as CalendarIcon, AlertCircle, GripVertical, ExternalLink, StickyNote, Pencil, Check, X, Trash2 } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

interface LeadCardProps {
  lead: any;
  sourceLabel?: string;
  visitStatusLabel?: string;
  visitStatusClass?: string;
  onOpen: (lead: any) => void;
  onWhatsApp?: (lead: any) => void;
  onSchedule?: (lead: any) => void;
  canEditNote?: boolean;
  onSaveNote?: (leadId: string, note: string) => Promise<void> | void;
}

const NOTE_WORD_LIMIT = 50;
const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const clampToWords = (s: string, limit: number) => {
  const parts = s.split(/(\s+)/); // keep separators
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

export default function LeadCard({ lead, sourceLabel, visitStatusLabel, visitStatusClass, onOpen, onWhatsApp, onSchedule, canEditNote, onSaveNote }: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: "lead", lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const ageDays = differenceInDays(new Date(), new Date(lead.updated_at || lead.created_at));
  const isStale = ageDays > 7 && lead.status !== "enrolled";

  const rawDate = lead.lead_received_date || lead.inquiry_date || lead.created_at;
  const displayDate = rawDate ? format(new Date(rawDate), "d MMM yyyy") : null;
  const note: string = lead.kanban_note || "";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const draftWords = countWords(draft);
  const overLimit = draftWords > NOTE_WORD_LIMIT;

  const handleSave = async () => {
    if (!onSaveNote || overLimit) return;
    setSaving(true);
    try {
      await onSaveNote(lead.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onSaveNote) return;
    setDeleting(true);
    try {
      await onSaveNote(lead.id, "");
      setConfirmDelete(false);
      setEditing(false);
      setDraft("");
    } finally {
      setDeleting(false);
    }
  };

  // Prevent drag activation when interacting with buttons, inputs, textareas.
  const stopDrag = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-manipulation"
      {...attributes}
      {...listeners}
    >
      <Card
        className={cn(
          "relative hover:shadow-md hover:-translate-y-0.5 transition-all bg-card border-border/60 cursor-grab active:cursor-grabbing",
          isDragging && "ring-2 ring-primary shadow-lg"
        )}
      >
        <CardContent className="p-3 space-y-2">
          {/* Top row: drag handle + name + stale flag */}
          <div className="flex items-start gap-1.5">
            <span
              className="text-muted-foreground/60 shrink-0 -ml-1 mt-0.5"
              title="Drag card to move between stages"
              aria-hidden="true"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{lead.child_name}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{lead.parent_name}</p>
            </div>
            {isStale && (
              <span title={`Idle ${ageDays} days`} className="shrink-0 mt-0.5">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              </span>
            )}
          </div>

          {/* Phone */}
          {lead.phone && (
            <div className="flex items-center gap-1.5 pl-5">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate tabular-nums">{lead.phone}</span>
            </div>
          )}

          {/* Badges row */}
          {(visitStatusLabel || sourceLabel) && (
            <div className="flex flex-wrap gap-1 pl-5">
              {visitStatusLabel && (
                <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-normal", visitStatusClass)}>
                  {visitStatusLabel}
                </Badge>
              )}
              {sourceLabel && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                  {sourceLabel}
                </Badge>
              )}
            </div>
          )}

          {/* Short note (view/edit) */}
          {editing ? (
            <div
              className="pl-5 space-y-1"
              onClick={stopDrag}
              onPointerDown={stopDrag}
            >
              <Textarea
                autoFocus
                value={draft}
                onChange={(e) => {
                  const next = e.target.value;
                  // Hard cap: block typing once we would exceed 50 words.
                  if (countWords(next) > NOTE_WORD_LIMIT) {
                    setDraft(clampToWords(next, NOTE_WORD_LIMIT));
                  } else {
                    setDraft(next);
                  }
                }}
                rows={2}
                placeholder="Add a short note (max 50 words)"
                className="text-[11px] min-h-[54px] resize-none"
              />
              <div className="flex items-center justify-between">
                <span className={cn("text-[10px] tabular-nums", overLimit ? "text-destructive" : "text-muted-foreground")}>
                  {draftWords}/{NOTE_WORD_LIMIT} words
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    title="Cancel"
                    onClick={() => { setDraft(note); setEditing(false); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-primary"
                    title="Save note"
                    onClick={handleSave}
                    disabled={saving || overLimit}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : note ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="pl-5" onPointerDown={stopDrag}>
                    <div
                      className={cn(
                        "flex items-start gap-1.5 rounded-md border px-2 py-1.5 group",
                        "bg-yellow-100/80 border-yellow-300/70 dark:bg-yellow-500/10 dark:border-yellow-500/30",
                        canEditNote ? "cursor-pointer" : "cursor-default",
                      )}
                      onClick={(e) => {
                        if (canEditNote) { e.stopPropagation(); setDraft(note); setEditing(true); }
                      }}
                    >
                      <StickyNote className="h-3 w-3 text-yellow-700 dark:text-yellow-300 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-yellow-900 dark:text-yellow-100 line-clamp-2 leading-snug flex-1 whitespace-pre-wrap">
                        {note}
                      </p>
                      {canEditNote && (
                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Edit note"
                            aria-label="Edit note"
                            className="p-0.5 rounded hover:bg-yellow-200/60 dark:hover:bg-yellow-500/20 text-yellow-800 dark:text-yellow-200"
                            onClick={(e) => { e.stopPropagation(); setDraft(note); setEditing(true); }}
                            onPointerDown={stopDrag}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="Delete note"
                            aria-label="Delete note"
                            className="p-0.5 rounded hover:bg-destructive/15 text-destructive"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                            onPointerDown={stopDrag}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs whitespace-pre-wrap">
                  {note}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : canEditNote ? (
            <div className="pl-5" onPointerDown={stopDrag}>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); setDraft(""); setEditing(true); }}
              >
                <StickyNote className="h-3 w-3 mr-1" />
                Add note
              </Button>
            </div>
          ) : null}

          {/* Footer: action bar + age */}
          <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-border/40">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
              {displayDate && (
                <span className="flex items-center gap-1" title="Lead received date">
                  <CalendarIcon className="h-3 w-3" />
                  {displayDate}
                </span>
              )}
              <span>· {ageDays}d in stage</span>
            </div>
            <div className="flex items-center gap-0.5" onPointerDown={stopDrag}>
              {lead.phone && onWhatsApp && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="WhatsApp"
                  onClick={(e) => { e.stopPropagation(); onWhatsApp(lead); }}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </Button>
              )}
              {onSchedule && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Schedule visit"
                  onClick={(e) => { e.stopPropagation(); onSchedule(lead); }}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Open lead"
                onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent onPointerDown={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
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
    </div>
  );
}