import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function HomeScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Home" subtitle="Your day at a glance" />
      <EmptyState
        icon="home-outline"
        title="Home dashboard coming soon"
        message="Today's clock status, leave balance, and quick actions will live here."
      />
    </ScreenContainer>
  );
}
