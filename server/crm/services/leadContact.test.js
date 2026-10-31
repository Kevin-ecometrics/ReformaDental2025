const { test, expect } = require("bun:test");
const { parseContactPatch } = require("./leadContact");

test("toma solo los campos presentes y limpia los vacios", () => {
  expect(parseContactPatch({ stage: "won" })).toEqual({ patch: {} });
  expect(parseContactPatch({ name: "  Ana  ", email: " ", phone: null })).toEqual({
    patch: { name: "Ana", email: null, phone: null },
  });
});

test("rechaza datos invalidos", () => {
  expect(parseContactPatch({ name: "  " }).error).toBe("name is required");
  expect(parseContactPatch({ name: null }).error).toBe("name is required");
  expect(parseContactPatch({ email: "ana@x.com\nBcc: otro@x.com" }).error).toBe("email is not valid");
  expect(parseContactPatch({ phone: "1".repeat(51) }).error).toBe("phone is too long");
  expect(parseContactPatch({ phone: 664 }).error).toBe("phone must be text");
});
