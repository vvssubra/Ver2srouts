import DashboardLayout from "@/components/DashboardLayout";
import Classrooms from "./Classrooms";

export default function ClassroomWorkspace() {
  return (
    <DashboardLayout>
      <Classrooms embedded />
    </DashboardLayout>
  );
}