import { useState, useCallback, useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Type, Image, MousePointerClick, Minus, GripVertical, Trash2, Plus,
  Heading1, ArrowLeft, Send, Save, Eye, Upload, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface ContentBlock {
  id: string;
  type: "heading" | "text" | "image" | "button" | "divider";
  content?: string;
  url?: string;
  caption?: string;
  text?: string;
}

interface NewsletterComposerProps {
  branchId: string;
  newsletter?: {
    id: string;
    title: string;
    subject: string;
    content_blocks: ContentBlock[];
    target_audience: string;
    status: string;
  };
  brandColor?: string;
  brandName?: string;
  logoUrl?: string | null;
  onSave: (data: { title: string; subject: string; content_blocks: ContentBlock[]; target_audience: string }) => Promise<void>;
  onSend: (data: { title: string; subject: string; content_blocks: ContentBlock[]; target_audience: string }) => Promise<void>;
  onBack: () => void;
  lockedAudience?: "parents" | "staff";
}

function generateBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function SortableBlock({
  block, onUpdate, onDelete,
  branchId,
}: {
  block: ContentBlock;
  onUpdate: (id: string, updates: Partial<ContentBlock>) => void;
  onDelete: (id: string) => void;
  branchId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const [uploading, setUploading] = useState(false);

  const style = { transform: CSS.Transform.toString(transform), transition };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${branchId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("newsletter-assets").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("newsletter-assets").getPublicUrl(path);
      onUpdate(block.id, { url: urlData.publicUrl });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="group flex gap-2 items-start border rounded-lg p-3 bg-card">
      <button {...attributes} {...listeners} className="mt-2 cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{block.type}</Badge>
          <button onClick={() => onDelete(block.id)} className="ml-auto text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {block.type === "heading" && (
          <Input
            value={block.content || ""}
            onChange={(e) => onUpdate(block.id, { content: e.target.value })}
            placeholder="Heading text…"
            className="font-bold text-lg"
          />
        )}

        {block.type === "text" && (
          <Textarea
            value={block.content || ""}
            onChange={(e) => onUpdate(block.id, { content: e.target.value })}
            placeholder="Write your content here…"
            rows={4}
          />
        )}

        {block.type === "image" && (
          <div className="space-y-2">
            {block.url ? (
              <div className="relative">
                <img src={block.url} alt={block.caption || "Newsletter image"} className="w-full rounded-md max-h-64 object-cover" />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => onUpdate(block.id, { url: "" })}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Click to upload image</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
              </label>
            )}
            <Input
              value={block.caption || ""}
              onChange={(e) => onUpdate(block.id, { caption: e.target.value })}
              placeholder="Image caption (optional)"
            />
          </div>
        )}

        {block.type === "button" && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={block.text || ""}
              onChange={(e) => onUpdate(block.id, { text: e.target.value })}
              placeholder="Button text"
            />
            <Input
              value={block.url || ""}
              onChange={(e) => onUpdate(block.id, { url: e.target.value })}
              placeholder="https://…"
            />
          </div>
        )}

        {block.type === "divider" && (
          <Separator className="my-2" />
        )}
      </div>
    </div>
  );
}

function NewsletterPreview({
  blocks, brandColor, brandName, logoUrl, subject,
}: {
  blocks: ContentBlock[];
  brandColor: string;
  brandName: string;
  logoUrl?: string | null;
  subject: string;
}) {
  return (
    <div className="border rounded-lg overflow-hidden max-w-lg mx-auto bg-muted/30">
      {/* Header */}
      <div style={{ backgroundColor: brandColor }} className="px-6 py-5 text-center">
        {logoUrl && (
          <img src={logoUrl} alt="Logo" className="mx-auto mb-2 max-h-10 object-contain" style={{ filter: "brightness(0) invert(1)" }} />
        )}
        <span className="text-white font-bold text-sm">{brandName}</span>
      </div>
      {/* Body */}
      <div className="px-6 py-5 bg-background space-y-4">
        {blocks.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">Add blocks to see a preview</p>
        )}
        {blocks.map((block) => {
          switch (block.type) {
            case "heading":
              return <h2 key={block.id} className="text-lg font-bold text-foreground">{block.content || "Heading"}</h2>;
            case "text":
              return <p key={block.id} className="text-sm text-muted-foreground whitespace-pre-wrap">{block.content || "Text content…"}</p>;
            case "image":
              return (
                <div key={block.id} className="space-y-1">
                  {block.url ? (
                    <img src={block.url} alt={block.caption || ""} className="w-full rounded-md max-h-48 object-cover" />
                  ) : (
                    <div className="bg-muted rounded-md h-32 flex items-center justify-center">
                      <Image className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {block.caption && <p className="text-xs text-muted-foreground text-center italic">{block.caption}</p>}
                </div>
              );
            case "button":
              return (
                <div key={block.id} className="text-center">
                  <span
                    className="inline-block px-6 py-2.5 text-white text-sm font-semibold rounded-lg"
                    style={{ backgroundColor: brandColor }}
                  >
                    {block.text || "Button"}
                  </span>
                </div>
              );
            case "divider":
              return <Separator key={block.id} />;
            default:
              return null;
          }
        })}
      </div>
      {/* Footer */}
      <div className="px-6 py-3 border-t bg-muted/30 text-center">
        <p className="text-[10px] text-muted-foreground">© {new Date().getFullYear()} {brandName}. All rights reserved.</p>
      </div>
    </div>
  );
}

export default function NewsletterComposer({
  branchId, newsletter, brandColor = "#7c3aed", brandName = "School",
  logoUrl, onSave, onSend, onBack, lockedAudience,
}: NewsletterComposerProps) {
  const [title, setTitle] = useState(newsletter?.title || "");
  const [subject, setSubject] = useState(newsletter?.subject || "");
  const [audience, setAudience] = useState(
    lockedAudience || newsletter?.target_audience || "parents"
  );
  const [blocks, setBlocks] = useState<ContentBlock[]>(
    (newsletter?.content_blocks as ContentBlock[]) || []
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addBlock = (type: ContentBlock["type"]) => {
    setBlocks((prev) => [...prev, { id: generateBlockId(), type }]);
  };

  const updateBlock = useCallback((id: string, updates: Partial<ContentBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIdx = prev.findIndex((b) => b.id === active.id);
        const newIdx = prev.findIndex((b) => b.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const getData = () => ({ title, subject, content_blocks: blocks, target_audience: audience });

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try { await onSave(getData()); } finally { setSaving(false); }
  };

  const handleSend = async () => {
    if (!title.trim() || !subject.trim()) { toast({ title: "Title and subject required", variant: "destructive" }); return; }
    if (blocks.length === 0) { toast({ title: "Add at least one content block", variant: "destructive" }); return; }
    setSending(true);
    try { await onSend(getData()); } finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-4 w-4 mr-2" />{showPreview ? "Editor" : "Preview"}
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save Draft"}
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            <Send className="h-4 w-4 mr-2" />{sending ? "Sending…" : "Send Newsletter"}
          </Button>
        </div>
      </div>

      {showPreview ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">Subject: <strong>{subject || "(no subject)"}</strong></p>
          <NewsletterPreview blocks={blocks} brandColor={brandColor} brandName={brandName} logoUrl={logoUrl} subject={subject} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Editor */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Newsletter Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="March Newsletter" />
                  </div>
                  <div>
                    <Label>Email Subject Line</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="📰 March Update from our school!" />
                  </div>
                </div>
                <div className="max-w-xs">
                  <Label>Send To</Label>
                  {lockedAudience ? (
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {lockedAudience === "staff" ? "👩‍🏫 Staff Only" : "👨‍👩‍👧 Parents Only"}
                    </div>
                  ) : (
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parents">Parents Only</SelectItem>
                        <SelectItem value="staff">Staff Only</SelectItem>
                        <SelectItem value="both">Parents & Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Block toolbar */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Add Content Block</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => addBlock("heading")}><Heading1 className="h-4 w-4 mr-1" /> Heading</Button>
                  <Button variant="outline" size="sm" onClick={() => addBlock("text")}><Type className="h-4 w-4 mr-1" /> Text</Button>
                  <Button variant="outline" size="sm" onClick={() => addBlock("image")}><Image className="h-4 w-4 mr-1" /> Image</Button>
                  <Button variant="outline" size="sm" onClick={() => addBlock("button")}><MousePointerClick className="h-4 w-4 mr-1" /> Button</Button>
                  <Button variant="outline" size="sm" onClick={() => addBlock("divider")}><Minus className="h-4 w-4 mr-1" /> Divider</Button>
                </div>
              </CardContent>
            </Card>

            {/* Blocks */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {blocks.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <Plus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-sm">Add content blocks above to start building</p>
                    </div>
                  )}
                  {blocks.map((block) => (
                    <SortableBlock key={block.id} block={block} onUpdate={updateBlock} onDelete={deleteBlock} branchId={branchId} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Live mini preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Live Preview</p>
              <div className="transform scale-[0.85] origin-top">
                <NewsletterPreview blocks={blocks} brandColor={brandColor} brandName={brandName} logoUrl={logoUrl} subject={subject} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
