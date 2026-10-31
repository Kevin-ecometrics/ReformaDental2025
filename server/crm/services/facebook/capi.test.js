const { test, expect } = require("bun:test");
const { normalizePhone } = require("./capi");

test("agrega 52 solo a numeros de 10 digitos", () => {
  expect(normalizePhone("664 123 4567")).toBe("526641234567");
  expect(normalizePhone("+52 664 123 4567")).toBe("526641234567");
  expect(normalizePhone("+1 619 586 1436")).toBe("16195861436");
  expect(normalizePhone("123")).toBe("123");
  expect(normalizePhone("sin numero")).toBe("");
});
