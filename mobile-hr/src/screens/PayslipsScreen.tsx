import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function PayslipsScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Payslips" subtitle="Your pay history" />
      <EmptyState
        icon="document-text-outline"
        title="Payslips coming soon"
        message="Your confirmed and paid payslips will be listed here."
      />
    </ScreenContainer>
  );
}
