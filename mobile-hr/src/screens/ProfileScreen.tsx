import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function ProfileScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Profile" subtitle="Your details and documents" />
      <EmptyState
        icon="person-outline"
        title="Profile coming soon"
        message="Edit your personal details and manage your documents here."
      />
    </ScreenContainer>
  );
}
