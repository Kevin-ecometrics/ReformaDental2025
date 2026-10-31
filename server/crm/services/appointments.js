// Citas del sitio dentro del CRM: cada cita se cruza con los leads para saber
// si la persona ya esta en el CRM, y "Add to CRM" la convierte en lead a mano.
// No hay alta automatica a proposito: el calendario es publico y una cita falsa
// no debe convertirse sola en lead.
//
// El cruce se hace en JS y no con un JOIN: `citas` y `crm_leads` tienen
// colaciones distintas (general_ci vs unicode_ci) y MySQL rechaza comparar
// texto entre las dos.

const {
  listAppointments,
  getAppointment,
  listAppointmentsAfter,
  getMaxAppointmentId,
} = require("./repo/appointments");
const { listLeads } = require("./repo/leads");
const { addActivity, listActivities } = require("./repo/activities");
const { getLastCitaId, setLastCitaId } = require("./repo/syncState");
const { createLead, changeLeadStage } = require("./leads");
const { phoneKey, emailKey } = require("./matching");

/** La clinica agenda en hora de Tijuana, sin importar la zona del servidor. */
const CLINIC_TIME_ZONE = "America/Tijuana";
/** Solo estas avanzan solas: Consultation, Won y Lost ya pasaron de Scheduled. */
const MOVABLE_STAGES = ["new", "contacted"];
const APPOINTMENTS_BATCH = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LEAD_MS = 2 * 60 * 60 * 1000;

/**
 * Telefono primero, correo como respaldo. El correo solo cuenta si a alguno de
 * los dos le falta telefono: una familia puede compartir correo, y con telefonos
 * distintos son personas distintas que necesitan cada una su lead.
 * @param {{phone: string|null, email: string|null}} appointment
 * @param {import("../types").Lead[]} leads
 * @returns {import("../types").Lead[]} puede haber varios: se permiten datos repetidos
 */
function matchLeads(appointment, leads) {
  const phone = phoneKey(appointment.phone);
  const email = emailKey(appointment.email);
  const byPhone = phone ? leads.filter((lead) => phoneKey(lead.phone) === phone) : [];
  if (byPhone.length > 0) return byPhone;
  return email
    ? leads.filter((lead) => emailKey(lead.email) === email && !(phone && phoneKey(lead.phone)))
    : [];
}

/**
 * @param {{phone: string|null, email: string|null}} appointment
 * @param {import("../types").Lead[]} leads
 * @returns {import("../types").Lead|null}
 */
function matchLead(appointment, leads) {
  return matchLeads(appointment, leads)[0] || null;
}

/**
 * Hoy o despues, en hora de la clinica. Una cita con fecha pasada no agenda nada.
 * @param {{date: string}} appointment
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isUpcoming(appointment, nowMs = Date.now()) {
  const today = new Date(nowMs).toLocaleDateString("sv-SE", { timeZone: CLINIC_TIME_ZONE });
  return appointment.date >= today;
}

/**
 * Un dia antes de la cita; si eso ya paso, ahora. Calcula el desfase con Intl
 * porque Tijuana cambia de horario y `citas` guarda la hora local sin zona.
 * @param {{date: string, time: string}} appointment
 * @param {number} [nowMs]
 * @returns {string} ISO
 */
function reminderDueAt(appointment, nowMs = Date.now()) {
  const asUtc = Date.parse(`${appointment.date}T${appointment.time}:00Z`);
  const shownInClinic = new Date(asUtc).toLocaleString("sv-SE", { timeZone: CLINIC_TIME_ZONE });
  const offset = asUtc - Date.parse(`${shownInClinic.replace(" ", "T")}Z`);
  return new Date(Math.max(asUtc + offset - DAY_MS, nowMs)).toISOString();
}

/**
 * La proxima cita de hoy en adelante que coincide con el lead.
 * @param {import("../types").Lead} lead
 * @param {import("./repo/appointments").Appointment[]} appointments
 * @param {number} [nowMs]
 * @returns {import("./repo/appointments").Appointment|null}
 */
function nextAppointmentFor(lead, appointments, nowMs = Date.now()) {
  const upcoming = appointments
    .filter((appointment) => isUpcoming(appointment, nowMs) && matchLeads(appointment, [lead]).length > 0)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return upcoming[0] || null;
}

/**
 * Vencimiento del recordatorio cuando alguien mueve un lead a Scheduled a mano: un
 * dia antes de su proxima cita. Sin cita, o si la consulta falla, las reglas usan
 * su vencimiento normal: esto nunca debe impedir el cambio de etapa.
 * @param {import("../types").Lead} lead
 * @returns {Promise<{taskDueAt: string}|undefined>}
 */
async function scheduledTaskOptions(lead) {
  try {
    const next = nextAppointmentFor(lead, await listAppointments());
    return next ? { taskDueAt: reminderDueAt(next) } : undefined;
  } catch (err) {
    console.error(`[crm/appointments] no se pudo buscar la cita del lead ${lead.id}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * Decide que hacer con una cita nueva, sin escribir nada. Con varios leads activos
 * no mueve ninguno: adivinar podria mandar a Meta el evento del lead equivocado.
 * @param {import("./repo/appointments").Appointment} appointment
 * @param {import("../types").Lead[]} leads incluye archivados
 * @param {number} [nowMs]
 * @returns {{move: import("../types").Lead|null, note: import("../types").Lead[], text: string}}
 */
function planAppointment(appointment, leads, nowMs = Date.now()) {
  const text = `Appointment booked: ${appointment.date} ${appointment.time}`;
  // El lead creado desde esta cita ya se proceso al crearlo.
  if (ownLead(appointment, leads)) return { move: null, note: [], text };

  const matches = matchLeads(appointment, leads);
  const active = matches.filter((lead) => !lead.archivedAt);

  if (active.length > 1) {
    return { move: null, note: active, text: `${text}. Several leads share this contact: move the right one by hand.` };
  }
  if (active.length === 1) {
    const [lead] = active;
    const movable = MOVABLE_STAGES.includes(lead.stage) && isUpcoming(appointment, nowMs);
    return { move: movable ? lead : null, note: [lead], text };
  }
  return { move: null, note: matches.slice(0, 1), text };
}

/**
 * Paso del tick: mueve a Scheduled los leads de las citas nuevas, vengan del sitio
 * o del dashboard. El cursor avanza cita por cita: tras un reinicio se retoma donde
 * iba, y repetir una no vuelve a mover el lead porque ya esta en Scheduled.
 * La primera vez solo guarda la ultima cita: las viejas no deben mandar eventos a Meta.
 * @returns {Promise<void>}
 */
async function processNewAppointments() {
  const lastId = await getLastCitaId();
  if (lastId === null) {
    await setLastCitaId(await getMaxAppointmentId());
    return;
  }

  const appointments = await listAppointmentsAfter(lastId, APPOINTMENTS_BATCH);
  if (appointments.length === 0) return;

  const leads = await listLeads({ includeArchived: true });
  for (const appointment of appointments) {
    const { move, note, text } = planAppointment(appointment, leads);
    if (move) await changeLeadStage(move.id, "scheduled", { taskDueAt: reminderDueAt(appointment) });
    for (const lead of note) await addActivity(lead.id, "system", text);
    await setLastCitaId(appointment.id);
  }
}

/**
 * El lead creado desde esta misma cita. Solo los creados desde que existe
 * appointment_id lo tienen; los anteriores se reconocen con matchLead.
 * @param {{id: number}} appointment
 * @param {import("../types").Lead[]} leads
 * @returns {import("../types").Lead|null}
 */
function ownLead(appointment, leads) {
  return leads.find((lead) => lead.fieldDataRaw && lead.fieldDataRaw.appointment_id === appointment.id) || null;
}

/**
 * shortcut: carga todos los leads para cruzarlos en memoria; bien con cientos,
 * con miles conviene una columna de telefono normalizado con indice.
 */
async function listAppointmentsWithLeads() {
  // Los archivados cuentan como coincidencia: si no, "Add to CRM" crearia otro lead para la misma persona.
  const [appointments, leads] = await Promise.all([listAppointments(), listLeads({ includeArchived: true })]);
  return appointments.map((appointment) => {
    const own = ownLead(appointment, leads);
    const lead = own || matchLead(appointment, leads);
    return {
      ...appointment,
      leadId: lead ? lead.id : null,
      leadName: lead ? lead.name : null,
      leadArchived: Boolean(lead && lead.archivedAt),
      leadIsOwn: Boolean(own),
    };
  });
}

/**
 * Decide si un lead que acaba de llegar ya tenia cita: la persona agendo primero y
 * el lead entro despues, asi que el cursor de citas ya paso por ella. Con la misma
 * cautela que planAppointment: si varios leads activos coinciden, no adivina.
 * @param {import("../types").Lead} lead
 * @param {import("./repo/appointments").Appointment[]} appointments
 * @param {import("../types").Lead[]} leads incluye archivados
 * @param {number} [nowMs]
 * @returns {import("./repo/appointments").Appointment|null}
 */
function planNewLead(lead, appointments, leads, nowMs = Date.now()) {
  if (lead.stage !== "new" || lead.archivedAt) return null;
  const appointment = nextAppointmentFor(lead, appointments, nowMs);
  if (!appointment) return null;
  const active = matchLeads(appointment, leads).filter((other) => !other.archivedAt);
  return active.length === 1 ? appointment : null;
}

/**
 * Paso del tick: mueve a Scheduled los leads recien llegados que ya tenian cita. Solo
 * mira los de las ultimas horas, para no mover de golpe leads viejos ni mandar sus
 * eventos a Meta; y si alguien ya cambio la etapa de ese lead, no insiste.
 * @param {number} [nowMs]
 * @returns {Promise<void>}
 */
async function processRecentLeads(nowMs = Date.now()) {
  const leads = await listLeads({ includeArchived: true });
  const recent = leads.filter(
    (lead) => lead.stage === "new" && !lead.archivedAt && nowMs - new Date(lead.createdAt).getTime() < RECENT_LEAD_MS
  );
  if (recent.length === 0) return;

  const appointments = await listAppointments();
  for (const lead of recent) {
    const appointment = planNewLead(lead, appointments, leads, nowMs);
    if (!appointment) continue;
    const history = await listActivities(lead.id);
    if (history.some((activity) => activity.type === "stage_change")) continue;

    await changeLeadStage(lead.id, "scheduled", { taskDueAt: reminderDueAt(appointment, nowMs) });
    await addActivity(lead.id, "system", `Appointment booked: ${appointment.date} ${appointment.time}`);
  }
}

/**
 * Crea el lead de una cita. Si la persona ya esta en el CRM devuelve ese lead
 * sin crear otro (un doble clic, o dos personas del equipo a la vez). Con `asNew`
 * ignora esa coincidencia, para quien comparte correo o telefono con otro lead;
 * aun asi, una misma cita nunca crea dos leads.
 *
 * @param {number} id
 * @param {{asNew?: boolean}} [options]
 * @returns {Promise<{lead: import("../types").Lead, created: boolean}|null>} null si la cita no existe
 */
async function addAppointmentToCrm(id, options = {}) {
  const appointment = await getAppointment(id);
  if (!appointment) return null;

  const leads = await listLeads({ includeArchived: true });
  const existing = ownLead(appointment, leads) || (options.asNew ? null : matchLead(appointment, leads));
  if (existing) return { lead: existing, created: false };

  // Los datos de la cita van en fieldDataRaw para que la ficha del lead los
  // muestre igual que las respuestas de un formulario de Meta.
  const { lead } = await createLead({
    name: appointment.name,
    email: appointment.email,
    phone: appointment.phone,
    source: "manual",
    formName: "Website booking",
    fieldDataRaw: {
      appointment_id: appointment.id,
      appointment_date: appointment.date,
      appointment_time: appointment.time,
      first_visit: appointment.firstVisit ? "Yes" : "No",
      service: appointment.service,
      insurance: appointment.insurance,
    },
  });
  if (!isUpcoming(appointment)) return { lead, created: true };

  // Tiene cita, asi que va en Scheduled. Si esto falla, el lead ya existe y queda en New.
  try {
    const moved = await changeLeadStage(lead.id, "scheduled", { taskDueAt: reminderDueAt(appointment) });
    await addActivity(lead.id, "system", `Appointment booked: ${appointment.date} ${appointment.time}`);
    return { lead: moved || lead, created: true };
  } catch (err) {
    console.error(`[crm/appointments] no se pudo agendar el lead ${lead.id}:`, err instanceof Error ? err.message : err);
    return { lead, created: true };
  }
}

module.exports = {
  listAppointmentsWithLeads,
  addAppointmentToCrm,
  processNewAppointments,
  processRecentLeads,
  scheduledTaskOptions,
  planAppointment,
  planNewLead,
  reminderDueAt,
  isUpcoming,
  matchLead,
  ownLead,
  phoneKey,
};
