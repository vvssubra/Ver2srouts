import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlbumDetailSheet } from "@/components/daily-updates/AlbumDetailSheet";
import { AlbumManager } from "@/components/daily-updates/AlbumManager";
import UnifiedMomentsFeed from "@/components/daily-updates/UnifiedMomentsFeed";
import { useSearchParams } from "react-router-dom";

type TabKey = "feed" | "albums";

export default function DailyUpdates() {
  const [albumOpenId, setAlbumOpenId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: TabKey = tabParam === "albums" ? "albums" : "feed";

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setParams(v === "feed" ? {} : { tab: v })}>
          <TabsList>
            <TabsTrigger value="feed">Stories</TabsTrigger>
            <TabsTrigger value="albums">Albums</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="pt-4">
            <UnifiedMomentsFeed />
          </TabsContent>

          <TabsContent value="albums" className="pt-4">
            <AlbumManager onOpenAlbum={(id) => setAlbumOpenId(id)} />
          </TabsContent>
        </Tabs>

        <AlbumDetailSheet
          albumId={albumOpenId}
          open={!!albumOpenId}
          onOpenChange={(v) => !v && setAlbumOpenId(null)}
          onAddToAlbum={(_id: string) => { setAlbumOpenId(null); }}
        />
      </div>
    </DashboardLayout>
  );
}