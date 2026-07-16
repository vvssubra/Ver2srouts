import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Paperclip, Bell, Mail, X } from "lucide-react";

interface Worksheet {
  id: string;
  title: string;
  pdf_url: string;
}

interface BroadcastToParentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject?: string;
  defaultBody?: string;
  lessonPlanId?: string | null;
  worksheets?: Worksheet[];
}

export default function BroadcastToParentsDialog({
  open,
  onOpenChange,
  defaultSubject = "",
  defaultBody = "",
  lessonPlanId,
  worksheets = [],
}: BroadcastToParentsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [classId, setClassId] = useState("all");
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState(defaultBody);
  const [sendViaApp, setSendViaApp] = useState(true);
  const [sendViaEmail, setSendViaEmail] = useState(false);
  const [attachedUrls, setAttachedUrls] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // Fetch branch settings for class names
  const { data: branchSettings } = useQuery({
    queryKey: ["branch-settings-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_settings")
        .select("branch_id, class_names")
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const allClasses = (branchSettings || []).flatMap(
    (bs: any) => (bs.class_names || []).map((name: string) => ({ branchId: bs.branch_id, name }))
  );

  const toggleAttachment = (url: string) => {
    setAttachedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleSend = async () => {
    if (!user || !subject.trim() || !bodyText.trim()) {
      toast({ title: "Missing fields", description: "Subject and body are required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Get a branch_id from the first membership
      const { data: membership } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!membership) throw new Error("No branch membership found");

      const { error } = await supabase.from("parent_broadcasts" as any).insert({
        branch_id: membership.branch_id,
        class_id: classId === "all" ? null : classId,
        lesson_plan_id: lessonPlanId || null,
        subject,
        body_text: bodyText,
        attachment_urls: attachedUrls,
        send_via_app: sendViaApp,
        send_via_email: sendViaEmail,
        sent_by: user.id,
      } as any);

      if (error) throw error;

      toast({ title: "Broadcast sent! 📨", description: "Parents will receive your message." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Broadcast to Parents
          </SheetTitle>
          <SheetDescription>
            Share this week's learning journey with families
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          {/* Send To */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Send To</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {allClasses.map((cls: any, i: number) => (
                  <SelectItem key={i} value={cls.name}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="This week's adventure..."
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Message</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              placeholder="Write your message to parents..."
              className="resize-none"
            />
          </div>

          {/* Attachments */}
          {worksheets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Attach Worksheets
              </Label>
              <div className="space-y-2">
                {worksheets.map((ws) => (
                  <label
                    key={ws.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      attachedUrls.includes(ws.pdf_url)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={attachedUrls.includes(ws.pdf_url)}
                      onChange={() => toggleAttachment(ws.pdf_url)}
                      className="rounded"
                    />
                    <span className="text-sm">{ws.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Options */}
          <div className="space-y-4 rounded-lg border p-4">
            <Label className="text-sm font-medium">Delivery Options</Label>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Send via Parent App Notification</span>
              </div>
              <Switch checked={sendViaApp} onCheckedChange={setSendViaApp} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Also send to Email</span>
              </div>
              <Switch checked={sendViaEmail} onCheckedChange={setSendViaEmail} />
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || !subject.trim() || !bodyText.trim()}>
            {sending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Sending...</>
            ) : (
              <><Send className="h-4 w-4 mr-1.5" />Send Broadcast</>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
