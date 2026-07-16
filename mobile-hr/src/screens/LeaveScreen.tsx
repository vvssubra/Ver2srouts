import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function LeaveScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Leave" subtitle="Balance, requests, and history" />
      <EmptyState
        icon="calendar-outline"
        title="Leave management coming soon"
        message="Your leave balance, request form, and history will live here."
      />
    </ScreenContainer>
  );
}
