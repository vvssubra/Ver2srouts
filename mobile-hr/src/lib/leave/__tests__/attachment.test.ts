import { requiresAttachment } from "../../leave";

describe("requiresAttachment", () => {
  it("requires an attachment for medical leave", () => {
    expect(requiresAttachment("medical")).toBe(true);
  });

  it("requires an attachment for hospitalisation leave", () => {
    expect(requiresAttachment("hospitalisation")).toBe(true);
  });

  it("requires an attachment for compassionate leave", () => {
    expect(requiresAttachment("compassionate")).toBe(true);
  });

  it("does not require an attachment for annual leave", () => {
    expect(requiresAttachment("annual")).toBe(false);
  });

  it("does not require an attachment for maternity, paternity, unpaid, emergency, or replacement", () => {
    expect(requiresAttachment("maternity")).toBe(false);
    expect(requiresAttachment("paternity")).toBe(false);
    expect(requiresAttachment("unpaid")).toBe(false);
    expect(requiresAttachment("emergency")).toBe(false);
    expect(requiresAttachment("replacement")).toBe(false);
  });

  it("requires an attachment for a custom type flagged requires_attachment", () => {
    expect(requiresAttachment("custom", { requires_attachment: true })).toBe(true);
  });

  it("does not require an attachment for a custom type not flagged", () => {
    expect(requiresAttachment("custom", { requires_attachment: false })).toBe(false);
  });

  it("does not require an attachment when no custom type is passed for a custom leave_type", () => {
    expect(requiresAttachment("custom", null)).toBe(false);
    expect(requiresAttachment("custom")).toBe(false);
  });
});
