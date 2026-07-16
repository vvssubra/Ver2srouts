import { ScreenContainer } from "../components/ui/ScreenContainer";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { EmptyState } from "../components/ui/EmptyState";

export function ClaimsScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title="Claims" subtitle="Expense reimbursements" />
      <EmptyState
        icon="receipt-outline"
        title="Claims coming soon"
        message="Submit an expense claim with a receipt photo and track its status here."
      />
    </ScreenContainer>
  );
}
