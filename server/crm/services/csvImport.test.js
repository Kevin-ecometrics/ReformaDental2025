const { test, expect } = require("bun:test");
const { parseCsv, planCsvImport } = require("./csvImport");

test("respeta comillas, comillas dobles, saltos CRLF y lineas vacias", () => {
  const csv = 'name,email\r\n"Perez, Ana",ana@x.com\r\n\r\n"Luis ""Lucho"" Mora",\n';
  expect(parseCsv(csv)).toEqual([
    ["name", "email"],
    ["Perez, Ana", "ana@x.com"],
    ['Luis "Lucho" Mora', ""],
  ]);
});

test("importa nombres con coma entre comillas y quita el BOM de Excel", () => {
  const plan = planCsvImport('﻿Name,Email,Phone\n"Perez, Ana",ana@x.com,6641112222', []);
  expect(plan).toEqual({
    rows: [{ name: "Perez, Ana", email: "ana@x.com", phone: "6641112222" }],
    duplicates: 0,
    invalid: 0,
  });
});

test("no parte un nombre con coma sin comillas: lo marca invalido", () => {
  const plan = planCsvImport("name,email,phone\nPerez, Ana,ana@x.com,6641112222", []);
  expect(plan).toMatchObject({ rows: [], invalid: 1 });
});

test("omite duplicados contra la base y dentro del archivo", () => {
  const existing = [{ phone: "+52 664 111 2222", email: "ya@x.com" }];
  const csv = "name,email,phone\nA,ya@x.com,\nB,,6641112222\nC,c@x.com,\nC2,C@x.com,\nD,,";
  const plan = planCsvImport(csv, existing);
  expect(plan.rows.map((r) => r.name)).toEqual(["C", "D"]);
  expect(plan.duplicates).toBe(3);
});

test("rechaza correos invalidos, filas sin nombre y encabezados sin name", () => {
  expect(planCsvImport("name,email\nA,no-es-correo\n,b@x.com", []).invalid).toBe(2);
  expect(planCsvImport("email\nb@x.com", []).error).toContain('"name"');
  expect(planCsvImport("name,email", []).error).toContain("header");
});
