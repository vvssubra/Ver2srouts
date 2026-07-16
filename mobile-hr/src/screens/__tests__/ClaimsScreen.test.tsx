import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClaimsScreen } from "../ClaimsScreen";

// @expo/vector-icons pulls in expo-font -> expo-asset, which isn't installed
// in this project (it's not a declared dependency of the app). Stubbing the
// icon set here avoids that unrelated resolution failure without touching
// any shared component or production code.
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
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
      // staff_claims
      return mockMakeChain({ data: [], error: null });
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/receipt.jpg" } }),
      }),
    },
  },
}));

function renderClaimsScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ClaimsScreen />
    </QueryClientProvider>
  );
}

describe("ClaimsScreen", () => {
  it("shows a loading state before the query resolves", async () => {
    await renderClaimsScreen();
    expect(screen.getByText("Claims")).toBeTruthy();
    expect(screen.getByText(/Loading your claims/)).toBeTruthy();
  });

  it("renders the submit form and an empty history state once the query resolves", async () => {
    await renderClaimsScreen();
    await waitFor(() => expect(screen.getByText("Submit a claim")).toBeTruthy());
    expect(screen.getByText("Submit claim")).toBeTruthy();
    expect(screen.getByText("No claims yet")).toBeTruthy();
  });
});
