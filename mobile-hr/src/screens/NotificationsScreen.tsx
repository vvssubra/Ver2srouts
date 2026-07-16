import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function NotificationsScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Notifications" />
      <EmptyState
        icon="notifications-outline"
        title="Notifications coming soon"
        message="Approvals, reminders, and announcements will show up here."
      />
    </ScreenContainer>
  );
}
