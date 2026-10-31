const { test, expect } = require("bun:test");
const { emailHtml } = require("./emailLayout");

test("escapa los datos del lead y conserva los saltos de linea", () => {
  const html = emailHtml("Hola <b>Ana</b>", 'Hola <img src=x onerror="alert(1)">,\n\nSaludos');
  expect(html).not.toContain("<b>Ana</b>");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("Hola &lt;b&gt;Ana&lt;/b&gt;");
  expect(html).toContain("<br><br>Saludos");
});
