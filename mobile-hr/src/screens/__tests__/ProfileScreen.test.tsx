import { render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfileScreen } from "../ProfileScreen";

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

const mockProfile = {
  id: "user-1",
  email: "jane@example.com",
  first_name: "Jane",
  last_name: "Doe",
  phone: "012-345 6789",
};

const mockStaffProfile = {
  user_id: "user-1",
  phone: "012-345 6789",
  address: "1 Jalan Contoh",
  emergency_contact_name: "John Doe",
  emergency_contact_phone: "019-888 7777",
  employment_type: "full_time",
  employment_start_date: "2024-01-01",
  ic_number: "900101-01-1234",
  tax_number: null,
  epf_number: null,
  socso_number: null,
  eis_number: null,
  bank_name: null,
  bank_account: null,
};

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return mockMakeChain({ data: mockProfile, error: null });
      }
      if (table === "staff_profiles") {
        return mockMakeChain({ data: mockStaffProfile, error: null });
      }
      // staff_documents
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

function renderProfileScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfileScreen />
    </QueryClientProvider>
  );
}

describe("ProfileScreen", () => {
  it("shows a loading state before the query resolves", async () => {
    await renderProfileScreen();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText(/Loading your profile/)).toBeTruthy();
  });

  it("renders profile details, contact form, and an empty documents state once resolved", async () => {
    await renderProfileScreen();
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeTruthy());
    expect(screen.getByText("jane@example.com")).toBeTruthy();
    expect(screen.getByText(/Contact HR to update payroll/)).toBeTruthy();
    expect(screen.getByText("Save changes")).toBeTruthy();
    expect(screen.getByText("No documents yet")).toBeTruthy();
  });
});
