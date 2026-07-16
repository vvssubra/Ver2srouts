import DashboardLayout from "@/components/DashboardLayout";
import BackToCommandCenter from "@/components/curriculum/BackToCommandCenter";
import SchoolMethodologiesConfig from "@/components/academic/SchoolMethodologiesConfig";
import { HeartHandshake } from "lucide-react";

export default function SchoolMethodology() {
  return (
    <DashboardLayout>
      <BackToCommandCenter tab="foundation" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HeartHandshake className="h-6 w-6 text-primary" />
            School Methodology
          </h1>
          <p className="text-muted-foreground">
            Select the pedagogical approaches your school adopts. AI lesson plans and parent
            communication tone mirror these choices.
          </p>
        </div>

        {/* Methodology selection (1–3 frameworks) */}
        <SchoolMethodologiesConfig />
      </div>
    </DashboardLayout>
  );
}