import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, FileText, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function StaffAnnouncements() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"announcements" | "newsletters">("announcements");

  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user,
  });
  const branchId = membership?.branch_id;

  const { data: announcements, isLoading: loadingA } = useQuery({
    queryKey: ["staff-announcements", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .eq("branch_id", branchId!)
        .eq("target_type", "staff")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: newsletters, isLoading: loadingN } = useQuery({
    queryKey: ["staff-newsletters", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("newsletters")
        .select("*")
        .eq("branch_id", branchId!)
        .in("target_audience", ["staff", "both"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Staff Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Updates and newsletters from HR & admin
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="announcements" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Announcements
              {announcements && announcements.length > 0 && (
                <Badge variant="secondary" className="ml-1">{announcements.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="newsletters" className="gap-2">
              <FileText className="h-4 w-4" />
              Newsletters
              {newsletters && newsletters.length > 0 && (
                <Badge variant="secondary" className="ml-1">{newsletters.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="announcements" className="space-y-3 mt-4">
            {loadingA ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : !announcements || announcements.length === 0 ? (
              <EmptyState label="No staff announcements yet" />
            ) : (
              announcements.map((a: any) => (
                <Card key={a.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base">{a.title}</h3>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {a.created_at && formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{a.body}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="newsletters" className="space-y-3 mt-4">
            {loadingN ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : !newsletters || newsletters.length === 0 ? (
              <EmptyState label="No staff newsletters yet" />
            ) : (
              newsletters.map((n: any) => (
                <Card key={n.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-base">{n.title}</h3>
                        {n.subject && (
                          <p className="text-xs text-muted-foreground">{n.subject}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {n.created_at && formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {Array.isArray(n.content_blocks) && (
                      <div className="space-y-2">
                        {n.content_blocks.slice(0, 3).map((block: any, i: number) => (
                          <div key={i} className="text-sm text-foreground/80">
                            {block.type === "text" && <p className="whitespace-pre-wrap">{block.content}</p>}
                            {block.type === "heading" && <p className="font-medium">{block.content}</p>}
                            {block.type === "image" && block.url && (
                              <img src={block.url} alt="" className="rounded-md max-h-48 object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-2 text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p className="text-sm">{label}</p>
      </CardContent>
    </Card>
  );
}