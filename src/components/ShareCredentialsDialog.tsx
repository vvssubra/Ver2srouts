import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Mail, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ShareCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  temporaryPassword: string;
  userName: string;
  branchId?: string;
  onClose?: () => void;
}

export default function ShareCredentialsDialog({
  open,
  onOpenChange,
  email,
  temporaryPassword,
  userName,
  branchId,
  onClose,
}: ShareCredentialsDialogProps) {
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const credentialText = `Login Credentials for ${userName}\n\nEmail: ${email}\nTemporary Password: ${temporaryPassword}\n\nPlease log in and change your password immediately.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credentialText);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "welcome_credentials",
          to: email,
          data: {
            userName,
            email,
            temporaryPassword,
            loginUrl: `${window.location.origin}/auth`,
          },
          branchId: branchId || undefined,
        },
      });
      if (error) throw error;
      toast({ title: "Welcome email sent", description: `Credentials sent to ${email}` });
    } catch (e: any) {
      toast({ title: "Email failed", description: e.message || "Could not send email. Share credentials manually.", variant: "destructive" });
    }
    setSendingEmail(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            Account Created Successfully
          </DialogTitle>
          <DialogDescription>
            Share these credentials with {userName} so they can log in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
              <p className="text-sm font-mono mt-1">{email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Temporary Password</p>
              <p className="text-sm font-mono mt-1 select-all">{temporaryPassword}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              This password will not be shown again after closing this dialog. Make sure to copy or send it now.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied!" : "Copy Credentials"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleSendEmail} disabled={sendingEmail}>
              <Mail className="h-4 w-4 mr-2" />
              {sendingEmail ? "Sending..." : "Send via Email"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
