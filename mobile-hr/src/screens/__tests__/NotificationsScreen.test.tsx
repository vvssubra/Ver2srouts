import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsScreen } from "../NotificationsScreen";

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

type ChainResult = { data: unknown; error: unknown };

let mockNotificationsData: ChainResult = { data: [], error: null };

function mockMakeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    then: (resolve: (v: ChainResult) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => mockMakeChain(mockNotificationsData),
  },
}));

function renderNotificationsScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsScreen />
    </QueryClientProvider>
  );
}

describe("NotificationsScreen", () => {
  beforeEach(() => {
    mockNotificationsData = { data: [], error: null };
  });

  it("renders without crashing and shows a loading state before the query resolves", async () => {
    await renderNotificationsScreen();
    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByText(/Loading notifications/)).toBeTruthy();
  });

  it("shows the empty state once the query resolves with no notifications", async () => {
    await renderNotificationsScreen();
    await waitFor(() => expect(screen.getByText("No notifications yet")).toBeTruthy());
  });

  it("renders notification rows with an unread indicator once the query resolves", async () => {
    mockNotificationsData = {
      data: [
        {
          id: "n1",
          user_id: "user-1",
          title: "Leave request approved",
          message: "Your annual leave request was approved.",
          type: "leave",
          priority: "normal",
          is_read: false,
          action_url: "/leave-requests/1",
          reference_id: null,
          group_key: null,
          archived_at: null,
          created_at: new Date().toISOString(),
        },
        {
          id: "n2",
          user_id: "user-1",
          title: "Payslip ready",
          message: "Your June payslip is ready to view.",
          type: "payslip",
          priority: "normal",
          is_read: true,
          action_url: null,
          reference_id: null,
          group_key: null,
          archived_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    };

    await renderNotificationsScreen();
    await waitFor(() => expect(screen.getByText("Leave request approved")).toBeTruthy());
    expect(screen.getByText("Payslip ready")).toBeTruthy();
  });
});
