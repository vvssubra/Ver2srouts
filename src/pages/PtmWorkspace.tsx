import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, CalendarDays, CalendarCheck, Inbox } from "lucide-react";
import PtmPrep from "./PtmPrep";
import PtmMeetingDetail from "./PtmMeetingDetail";
import PtmSlots from "./PtmSlots";

type TabKey = "slots" | "bookings" | "meetings" | "prep";

export default function PtmWorkspace() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey =
    raw === "bookings" || raw === "meetings" || raw === "prep" || raw === "slots"
      ? raw
      : "slots";

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === "slots") next.delete("tab");
    else next.set("tab", v);
    setParams(next, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Parent Meetings (PTM)</h1>
          <p className="text-sm text-muted-foreground">
            Publish slots, approve parent bookings, run meetings, and share reports — all in one place.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="slots" className="gap-1.5"><CalendarCheck className="h-3.5 w-3.5" />Slots</TabsTrigger>
            <TabsTrigger value="bookings" className="gap-1.5"><Inbox className="h-3.5 w-3.5" />Bookings</TabsTrigger>
            <TabsTrigger value="meetings" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Meetings</TabsTrigger>
            <TabsTrigger value="prep" className="gap-1.5"><Users className="h-3.5 w-3.5" />Prep & Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="slots" className="pt-4">
            <PtmSlots embedded view="slots" />
          </TabsContent>
          <TabsContent value="bookings" className="pt-4">
            <PtmSlots embedded view="bookings" />
          </TabsContent>
          <TabsContent value="meetings" className="pt-4">
            <PtmMeetingDetail embedded />
          </TabsContent>
          <TabsContent value="prep" className="pt-4">
            <PtmPrep embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}