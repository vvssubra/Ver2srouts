import { toneForStatus, formatStatusLabel } from "../../../components/ui/StatusPill";
import { deriveOvertimeDisplayStatus } from "../../overtime";

describe("deriveOvertimeDisplayStatus", () => {
  it("formats the raw status through the shared formatStatusLabel helper", () => {
    expect(deriveOvertimeDisplayStatus({ status: "pending" })).toBe("Pending");
    expect(deriveOvertimeDisplayStatus({ status: "pending_payroll" })).toBe("Pending Payroll");
    expect(deriveOvertimeDisplayStatus({ status: "rejected" })).toBe("Rejected");
    expect(deriveOvertimeDisplayStatus({ status: "approved" })).toBe("Approved");
  });
});

describe("toneForStatus for overtime_requests statuses", () => {
  it("maps pending statuses to the pending tone", () => {
    expect(toneForStatus("pending")).toBe("pending");
    expect(toneForStatus("pending_payroll")).toBe("pending");
  });

  it("maps rejected to the negative tone", () => {
    expect(toneForStatus("rejected")).toBe("negative");
  });

  it("maps approved to the positive tone", () => {
    expect(toneForStatus("approved")).toBe("positive");
  });
});
