import { validateClaimInput } from "../../claims";

const baseInput = {
  claimType: "transport",
  description: "Grab rides to branch training",
  amount: 25.5,
};

describe("validateClaimInput", () => {
  it("passes on a valid claim", () => {
    expect(validateClaimInput(baseInput)).toBeNull();
  });

  it("rejects an amount of zero", () => {
    expect(validateClaimInput({ ...baseInput, amount: 0 })).toEqual(expect.any(String));
  });

  it("rejects a negative amount", () => {
    expect(validateClaimInput({ ...baseInput, amount: -12 })).toEqual(expect.any(String));
  });

  it("rejects a non-finite amount", () => {
    expect(validateClaimInput({ ...baseInput, amount: NaN })).toEqual(expect.any(String));
  });

  it("rejects an empty description", () => {
    expect(validateClaimInput({ ...baseInput, description: "" })).toEqual(expect.any(String));
  });

  it("rejects a whitespace-only description", () => {
    expect(validateClaimInput({ ...baseInput, description: "   " })).toEqual(expect.any(String));
  });

  it("rejects an unknown claim type", () => {
    expect(validateClaimInput({ ...baseInput, claimType: "flight" })).toEqual(expect.any(String));
  });

  it("accepts every known claim type", () => {
    for (const type of ["transport", "meal", "medical", "training", "equipment", "other"]) {
      expect(validateClaimInput({ ...baseInput, claimType: type })).toBeNull();
    }
  });
});
