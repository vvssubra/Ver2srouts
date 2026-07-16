import { render, screen, waitFor, fireEvent } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PayslipsScreen } from "../PayslipsScreen";

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
    in: () => chain,
    then: (resolve: (v: ChainResult) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

let mockPayrollResult: ChainResult = { data: [], error: null };

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: (_table: string) => mockMakeChain(mockPayrollResult),
  },
}));

function renderPayslipsScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PayslipsScreen />
    </QueryClientProvider>
  );
}

describe("PayslipsScreen", () => {
  beforeEach(() => {
    mockPayrollResult = { data: [], error: null };
  });

  it("shows a loading state before the query resolves", async () => {
    await renderPayslipsScreen();
    expect(screen.getByText("Payslips")).toBeTruthy();
    expect(screen.getByText(/Loading your payslips/)).toBeTruthy();
  });

  it("renders an empty state once the query resolves with no payslips", async () => {
    await renderPayslipsScreen();
    await waitFor(() => expect(screen.getByText("No payslips yet")).toBeTruthy());
  });

  it("lists confirmed/paid payslips and opens a detail view on tap", async () => {
    mockPayrollResult = {
      data: [
        {
          id: "payroll-1",
          user_id: "user-1",
          branch_id: "branch-1",
          month: 6,
          year: 2026,
          basic_salary: 3000,
          allowances: 0,
          other_allowances: null,
          other_allowance_notes: null,
          overtime_hours: null,
          overtime_rate: null,
          overtime_amount: null,
          claims_amount: 0,
          gross_salary: 3000,
          epf_employee: 330,
          epf_employer: 0,
          socso_employee: 0,
          socso_employer: 0,
          eis_employee: 0,
          eis_employer: 0,
          pcb_amount: 0,
          late_deduction: null,
          advance_deduction: null,
          other_deductions: null,
          other_deduction_notes: null,
          unpaid_leave_deduction: null,
          absent_deduction: 0,
          days_worked: null,
          net_salary: 2670,
          notes: null,
          status: "confirmed",
          submitted_at: null,
          submitted_by: null,
          approved_at: null,
          approved_by: null,
          paid_at: null,
          reversed_at: null,
          reversed_by: null,
          reversal_reason: null,
          created_at: "2026-06-01T00:00:00Z",
          created_by: "admin-1",
          updated_at: "2026-06-01T00:00:00Z",
        },
      ],
      error: null,
    };

    await renderPayslipsScreen();
    await waitFor(() => expect(screen.getByText("June 2026")).toBeTruthy());
    expect(screen.getByText("RM 2670.00 net")).toBeTruthy();

    fireEvent.press(screen.getByText("June 2026"));

    await waitFor(() => expect(screen.getByText("Payslip detail")).toBeTruthy());
    expect(screen.getByText("EPF (Employee)")).toBeTruthy();
    expect(screen.getByText("Net pay")).toBeTruthy();
  });
});
