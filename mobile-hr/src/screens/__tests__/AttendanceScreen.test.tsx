import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AttendanceScreen } from "../AttendanceScreen";

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
    gte: () => chain,
    lte: () => chain,
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
      if (table === "geofence_locations") {
        return mockMakeChain({ data: [], error: null });
      }
      if (table === "staff_geofence_assignments") {
        // No `.maybeSingle()` call anymore — production code treats this
        // as a possibly-multi-row query and tolerates zero/one/many rows.
        return mockMakeChain({ data: [], error: null });
      }
      // staff_attendance
      return mockMakeChain({ data: [], error: null });
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/selfie.jpg" } }),
      }),
    },
  },
}));

function renderAttendanceScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AttendanceScreen />
    </QueryClientProvider>
  );
}

describe("AttendanceScreen", () => {
  it("shows a loading state before the query resolves", async () => {
    await renderAttendanceScreen();
    expect(screen.getByText("Attendance")).toBeTruthy();
    expect(screen.getByText(/Loading today's attendance/)).toBeTruthy();
  });

  it("renders the not-clocked-in state and the empty 7-day list once the query resolves", async () => {
    await renderAttendanceScreen();
    await waitFor(() => expect(screen.getByText("Not clocked in yet")).toBeTruthy());
    expect(screen.getByText("Clock In")).toBeTruthy();
    expect(screen.getByText("Last 7 days")).toBeTruthy();
    // 7 placeholder days: today shows "Pending" (day still in progress,
    // matching "Not clocked in yet" above), the other 6 show "Absent".
    expect(screen.getAllByText("Absent")).toHaveLength(6);
    expect(screen.getByText("Pending")).toBeTruthy();
  });
});
