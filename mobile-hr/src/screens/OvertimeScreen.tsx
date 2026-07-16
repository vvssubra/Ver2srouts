import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function OvertimeScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Overtime" subtitle="Requests and history" />
      <EmptyState
        icon="time-outline"
        title="Overtime coming soon"
        message="Submit an overtime request and track its status here."
      />
    </ScreenContainer>
  );
}
