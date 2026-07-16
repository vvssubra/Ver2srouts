import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LeaveScreen } from "../LeaveScreen";

// @expo/vector-icons pulls in expo-font -> expo-asset, which isn't installed
// in this project (it's not a declared dependency of the app). Stubbing the
// icon set here avoids that unrelated resolution failure without touching
// any shared component or production code.
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
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
    maybeSingle: () => Promise.resolve(result),
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
      if (table === "leave_balances") {
        return mockMakeChain({ data: null, error: null });
      }
      if (table === "custom_leave_types") {
        return mockMakeChain({ data: [], error: null });
      }
      if (table === "custom_leave_balances") {
        return mockMakeChain({ data: [], error: null });
      }
      // leave_requests
      return mockMakeChain({ data: [], error: null });
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/doc.pdf" } }),
      }),
    },
  },
}));

function renderLeaveScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LeaveScreen />
    </QueryClientProvider>
  );
}

describe("LeaveScreen", () => {
  it("shows a loading state before the query resolves", async () => {
    await renderLeaveScreen();
    expect(screen.getByText("Leave")).toBeTruthy();
    expect(screen.getByText(/Loading your leave details/)).toBeTruthy();
  });

  it("renders balance cards for every standard leave type and the empty history state once resolved", async () => {
    await renderLeaveScreen();
    await waitFor(() => expect(screen.getByText("Request leave")).toBeTruthy());

    // "Annual"/"Medical"/"Unpaid" each appear twice: once as a balance row
    // label, once as a leave-type picker chip in the request form.
    expect(screen.getAllByText("Annual").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Medical").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Unpaid").length).toBeGreaterThanOrEqual(2);
    // Unpaid leave's balance row is the one place this exact caption shows.
    expect(screen.getByText("No cap on unpaid leave")).toBeTruthy();

    // No leave_requests rows were mocked -> the honest empty state shows.
    expect(screen.getByText("No leave requests yet")).toBeTruthy();
  });
});
