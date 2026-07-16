import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OvertimeScreen } from "../OvertimeScreen";

// @expo/vector-icons pulls in expo-font -> expo-asset, which isn't installed
// in this project (it's not a declared dependency of the app). Stubbing the
// icon set here avoids that unrelated resolution failure without touching
// any shared component or production code.
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../lib/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, user: { id: "user-1" } }),
}));

type ChainResult = { data: unknown; error: unknown };

function mockMakeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (v: ChainResult) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "branch_memberships") {
        return mockMakeChain({ data: [{ branch_id: "branch-1" }], error: null });
      }
      // overtime_requests
      return mockMakeChain({ data: [], error: null });
    },
    rpc: () =>
      Promise.resolve({
        data: { payroll_month: "2026-07-01", is_late: false, is_allowed: true },
        error: null,
      }),
  },
}));

function renderOvertimeScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OvertimeScreen />
    </QueryClientProvider>
  );
}

describe("OvertimeScreen", () => {
  it("shows a loading state before the query resolves", async () => {
    await renderOvertimeScreen();
    expect(screen.getByText("Overtime")).toBeTruthy();
    expect(screen.getByText(/Loading your overtime requests/)).toBeTruthy();
  });

  it("renders the submit form and an empty history state once the query resolves", async () => {
    await renderOvertimeScreen();
    await waitFor(() => expect(screen.getByText("Submit a request")).toBeTruthy());
    expect(screen.getByText("Submit request")).toBeTruthy();
    expect(screen.getByText("No overtime requests yet")).toBeTruthy();
  });
});
