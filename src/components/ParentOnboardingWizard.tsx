import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  allergies?: string;
  branch_id?: string;
}

interface Props {
  children: Child[];
  profile: any;
  onComplete: () => void;
}

export default function ParentOnboardingWizard({ children, profile, onComplete }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [language, setLanguage] = useState(profile?.preferred_language ?? "ms");
  const [aiConsent, setAiConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!phone.trim()) {
      toast({ title: "Phone number required", variant: "destructive" });
      return;
    }
    if (!aiConsent) {
      toast({ title: "Please agree to the privacy notice to continue", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ phone: phone || null, preferred_language: language } as any)
        .eq("id", user!.id);
      if (profErr) throw profErr;

      for (const child of children) {
        const { error: pdpaErr } = await supabase.from("pdpa_consents" as any).insert({
          parent_user_id: user!.id,
          student_id: child.id,
          branch_id: child.branch_id,
          consent_type: "ai_media_processing",
          is_granted: aiConsent,
        });
        if (pdpaErr) throw pdpaErr;
      }

      queryClient.invalidateQueries({ queryKey: ["my-children"] });
      queryClient.invalidateQueries({ queryKey: ["pdpa-consents"] });
      toast({ title: "All set! 🌱", description: "Welcome to Sprouts." });
      onComplete();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 pt-12 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Welcome to Sprouts 🌱</h1>
        <p className="text-sm text-muted-foreground">
          You're linked to {children.map((c) => c.first_name).join(", ")}. Just two quick things and you're in.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label>Your phone number</Label>
            <Input placeholder="+60 12-345 6789" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="text-xs text-muted-foreground">So the school can reach you in an emergency.</p>
          </div>

          <div className="space-y-2">
            <Label>Preferred language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ms">Bahasa Melayu</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="ta">தமிழ்</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <Switch checked={aiConsent} onCheckedChange={setAiConsent} className="mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">I agree to the privacy notice</p>
              <p className="text-xs text-muted-foreground">
                The school may use AI to write learning stories from your child's classroom photos and notes.
                Data is encrypted and never shared with third parties. You can withdraw consent any time.
              </p>
            </div>
          </div>

          <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <>Get started <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
          <p className="text-[11px] text-center text-muted-foreground">
            Allergies, emergency contacts and pickup details are managed by the school in your child's profile.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
