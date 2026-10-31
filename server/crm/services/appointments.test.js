const { describe, test, expect } = require("bun:test");
const { matchLead, ownLead, planAppointment, planNewLead, reminderDueAt, isUpcoming } = require("./appointments");

const ana = { id: "ana", phone: "+52 664 111 2222", email: "familia@x.com" };

test("mismo correo con otro telefono es otra persona", () => {
  expect(matchLead({ phone: "6643334444", email: "FAMILIA@x.com" }, [ana])).toBeNull();
});

test("una cita reconoce el lead creado desde ella, no otro con sus mismos datos", () => {
  const propio = { id: "propio", phone: ana.phone, email: ana.email, fieldDataRaw: { appointment_id: 7 } };
  expect(ownLead({ id: 7 }, [ana, propio])).toBe(propio);
  expect(ownLead({ id: 8 }, [ana, propio])).toBeNull();
});

test("reconoce a la misma persona", () => {
  expect(matchLead({ phone: "6641112222", email: "otro@x.com" }, [ana])).toBe(ana);
  const sinTelefono = { id: "sin", phone: null, email: "familia@x.com" };
  expect(matchLead({ phone: "6643334444", email: "familia@x.com" }, [sinTelefono])).toBe(sinTelefono);
  expect(matchLead({ phone: "123", email: "familia@x.com" }, [ana])).toBe(ana);
});

test("el telefono gana aunque otro lead tenga el mismo correo", () => {
  const beto = { id: "beto", phone: "6643334444", email: "familia@x.com" };
  expect(matchLead({ phone: "6643334444", email: "familia@x.com" }, [ana, beto])).toBe(beto);
});

describe("planAppointment", () => {
  const now = Date.parse("2026-10-30T18:00:00Z");
  const cita = { id: 9, phone: "6641112222", email: "familia@x.com", date: "2026-11-05", time: "10:00" };
  const lead = (id, stage, extra = {}) => ({ id, stage, phone: "6641112222", email: "familia@x.com", ...extra });

  test("mueve desde New y Contacted", () => {
    for (const stage of ["new", "contacted"]) {
      const l = lead("a", stage);
      expect(planAppointment(cita, [l], now)).toMatchObject({ move: l, note: [l] });
    }
  });

  test("en las demas etapas solo anota", () => {
    for (const stage of ["scheduled", "consultation", "won", "lost"]) {
      const l = lead("a", stage);
      expect(planAppointment(cita, [l], now)).toMatchObject({ move: null, note: [l] });
    }
  });

  test("una cita pasada solo anota", () => {
    const l = lead("a", "new");
    expect(planAppointment({ ...cita, date: "2026-10-01" }, [l], now)).toMatchObject({ move: null, note: [l] });
  });

  test("con varios leads activos no mueve ninguno y anota en todos", () => {
    const [a, b] = [lead("a", "new"), lead("b", "contacted")];
    const plan = planAppointment(cita, [a, b], now);
    expect(plan.move).toBeNull();
    expect(plan.note).toEqual([a, b]);
    expect(plan.text).toContain("Several leads");
  });

  test("un archivado no cuenta como activo ni se mueve", () => {
    const [activo, archivado] = [lead("a", "new"), lead("b", "new", { archivedAt: "2026-10-01" })];
    expect(planAppointment(cita, [activo, archivado], now).move).toBe(activo);
    expect(planAppointment(cita, [archivado], now)).toMatchObject({ move: null, note: [archivado] });
  });

  test("sin coincidencia o con lead propio no hace nada", () => {
    expect(planAppointment(cita, [], now)).toMatchObject({ move: null, note: [] });
    const propio = lead("a", "new", { fieldDataRaw: { appointment_id: 9 } });
    expect(planAppointment(cita, [propio], now)).toMatchObject({ move: null, note: [] });
  });
});

describe("planNewLead", () => {
  const now = Date.parse("2026-10-30T18:00:00Z");
  const cita = (date, time = "10:00") => ({ id: 1, phone: "6641112222", email: null, date, time });
  const nuevo = { id: "n", stage: "new", phone: "+52 664 111 2222", email: null, archivedAt: null };

  test("elige la proxima cita, ignorando las pasadas", () => {
    const [pasada, lejana, cercana] = [cita("2026-10-01"), cita("2026-12-01"), cita("2026-11-05")];
    expect(planNewLead(nuevo, [pasada, lejana, cercana], [nuevo], now)).toBe(cercana);
    expect(planNewLead(nuevo, [pasada], [nuevo], now)).toBeNull();
  });

  test("no actua si ya avanzo, esta archivado o varios leads comparten el contacto", () => {
    const appointments = [cita("2026-11-05")];
    const avanzado = { ...nuevo, stage: "contacted" };
    const archivado = { ...nuevo, archivedAt: "2026-10-01" };
    expect(planNewLead(avanzado, appointments, [avanzado], now)).toBeNull();
    expect(planNewLead(archivado, appointments, [archivado], now)).toBeNull();
    expect(planNewLead(nuevo, appointments, [nuevo, { ...nuevo, id: "otro" }], now)).toBeNull();
    expect(planNewLead(nuevo, appointments, [nuevo, { ...nuevo, id: "otro", archivedAt: "2026-10-01" }], now)).toBe(appointments[0]);
  });
});

test("el recordatorio vence un dia antes, en hora de Tijuana con y sin horario de verano", () => {
  const before = Date.parse("2026-01-01T00:00:00Z");
  expect(reminderDueAt({ date: "2026-07-15", time: "10:00" }, before)).toBe("2026-07-14T17:00:00.000Z");
  expect(reminderDueAt({ date: "2026-12-15", time: "10:00" }, before)).toBe("2026-12-14T18:00:00.000Z");
});

test("si falta menos de un dia, el recordatorio vence ahora", () => {
  const now = Date.parse("2026-12-15T00:00:00Z");
  expect(reminderDueAt({ date: "2026-12-15", time: "10:00" }, now)).toBe(new Date(now).toISOString());
});

test("hoy cuenta en hora de Tijuana, no en UTC", () => {
  // 02:00 UTC del 31 sigue siendo el 30 en Tijuana
  const now = Date.parse("2026-10-31T02:00:00Z");
  expect(isUpcoming({ date: "2026-10-30" }, now)).toBe(true);
  expect(isUpcoming({ date: "2026-10-29" }, now)).toBe(false);
});
