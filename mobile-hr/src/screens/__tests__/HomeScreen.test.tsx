import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomeScreen } from "../HomeScreen";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    getParent: () => ({ navigate: jest.fn() }),
  }),
}));

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

type ChainResult = { data: unknown; error: unknown; count?: number };

function mockMakeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: ChainResult) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "staff_attendance" || table === "leave_balances") {
        return mockMakeChain({ data: null, error: null });
      }
      return mockMakeChain({ data: null, error: null, count: 0 });
    },
  },
}));

function renderHomeScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen />
    </QueryClientProvider>
  );
}

describe("HomeScreen", () => {
  it("renders without crashing", async () => {
    await renderHomeScreen();
    expect(screen.getByText("Home")).toBeTruthy();
  });

  it("shows the quick actions row immediately, before the dashboard query resolves", async () => {
    await renderHomeScreen();
    expect(screen.getByText("Clock In/Out")).toBeTruthy();
    expect(screen.getByText("Request Leave")).toBeTruthy();
    expect(screen.getByText("Submit Claim")).toBeTruthy();
    expect(screen.getByText("View Payslips")).toBeTruthy();
  });

  it("shows the not-clocked-in and no-balance empty states once the query resolves with no data", async () => {
    await renderHomeScreen();
    await waitFor(() => expect(screen.getByText("Not clocked in yet")).toBeTruthy());
    expect(screen.getByText("No leave balance yet")).toBeTruthy();
    // No pending requests were mocked in, so the pending banner shouldn't render.
    expect(screen.queryByText(/pending request/)).toBeNull();
  });
});
