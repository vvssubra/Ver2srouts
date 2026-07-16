import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function AttendanceScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Attendance" subtitle="Clock in and out" />
      <EmptyState
        icon="location-outline"
        title="Clock in/out coming soon"
        message="Geofenced clock-in with selfie verification will live here."
      />
    </ScreenContainer>
  );
}
