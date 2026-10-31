const { test, expect } = require("bun:test");
const { findDuplicates } = require("./matching");

const ana = { id: "ana", phone: "+52 664 111 2222", email: "ana@x.com" };
const beto = { id: "beto", phone: null, email: "BETO@x.com" };

test("avisa por telefono o por correo, sin distinguir formato ni mayusculas", () => {
  expect(findDuplicates({ phone: "6641112222", email: null }, [ana, beto])).toEqual([ana]);
  expect(findDuplicates({ phone: null, email: "beto@x.com " }, [ana, beto])).toEqual([beto]);
  expect(findDuplicates({ phone: "6641112222", email: "beto@x.com" }, [ana, beto])).toEqual([ana, beto]);
});

test("no se marca a si mismo ni coincide con datos vacios o telefonos cortos", () => {
  expect(findDuplicates(ana, [ana, beto])).toEqual([]);
  expect(findDuplicates({ phone: null, email: null }, [{ id: "x", phone: null, email: null }])).toEqual([]);
  expect(findDuplicates({ phone: "123", email: null }, [{ id: "x", phone: "123", email: null }])).toEqual([]);
});
