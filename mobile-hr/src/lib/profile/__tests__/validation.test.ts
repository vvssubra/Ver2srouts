import { validateProfileEdit } from "../../profile";

describe("validateProfileEdit", () => {
  it("passes when everything is provided and non-empty", () => {
    expect(
      validateProfileEdit({
        phone: "012-345 6789",
        emergencyContactName: "Jane Doe",
        emergencyContactPhone: "019-888 7777",
      })
    ).toBeNull();
  });

  it("passes when everything is omitted (all fields optional)", () => {
    expect(validateProfileEdit({})).toBeNull();
  });

  it("rejects emergency contact name provided without a phone", () => {
    expect(
      validateProfileEdit({
        emergencyContactName: "Jane Doe",
      })
    ).toEqual(expect.any(String));
  });

  it("rejects emergency contact phone provided without a name", () => {
    expect(
      validateProfileEdit({
        emergencyContactPhone: "019-888 7777",
      })
    ).toEqual(expect.any(String));
  });

  it("passes when phone is provided alone with no emergency contact fields", () => {
    expect(validateProfileEdit({ phone: "012-345 6789" })).toBeNull();
  });

  it("rejects a phone that is only whitespace", () => {
    expect(validateProfileEdit({ phone: "   " })).toEqual(expect.any(String));
  });

  it("rejects an emergency contact name that is only whitespace, even with a phone present", () => {
    expect(
      validateProfileEdit({
        emergencyContactName: "   ",
        emergencyContactPhone: "019-888 7777",
      })
    ).toEqual(expect.any(String));
  });

  it("rejects an emergency contact phone that is only whitespace, even with a name present", () => {
    expect(
      validateProfileEdit({
        emergencyContactName: "Jane Doe",
        emergencyContactPhone: "   ",
      })
    ).toEqual(expect.any(String));
  });
});
