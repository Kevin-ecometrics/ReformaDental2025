// Citas del sitio dentro del CRM: cada cita se cruza con los leads para saber
// si la persona ya esta en el CRM, y "Add to CRM" la convierte en lead a mano.
// No hay alta automatica a proposito: el calendario es publico y una cita falsa
// no debe convertirse sola en lead.
//
// El cruce se hace en JS y no con un JOIN: `citas` y `crm_leads` tienen
// colaciones distintas (general_ci vs unicode_ci) y MySQL rechaza comparar
// texto entre las dos.

const { listAppointments, getAppointment } = require("./repo/appointments");
const { listLeads } = require("./repo/leads");
const { createLead } = require("./leads");

/**
 * Ultimos 10 digitos: la cita guarda "664…" y Meta manda "+52664…".
 * @param {string|null|undefined} phone
 * @returns {string|null}
 */
function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
function emailKey(email) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
}

/**
 * Telefono primero, correo como respaldo.
 * @param {{phone: string|null, email: string|null}} appointment
 * @param {import("../types").Lead[]} leads
 * @returns {import("../types").Lead|null}
 */
function matchLead(appointment, leads) {
  const phone = phoneKey(appointment.phone);
  const email = emailKey(appointment.email);
  return (
    (phone && leads.find((lead) => phoneKey(lead.phone) === phone)) ||
    (email && leads.find((lead) => emailKey(lead.email) === email)) ||
    null
  );
}

/**
 * shortcut: carga todos los leads para cruzarlos en memoria; bien con cientos,
 * con miles conviene una columna de telefono normalizado con indice.
 */
async function listAppointmentsWithLeads() {
  // Los archivados cuentan como coincidencia: si no, "Add to CRM" crearia otro lead para la misma persona.
  const [appointments, leads] = await Promise.all([listAppointments(), listLeads({ includeArchived: true })]);
  return appointments.map((appointment) => {
    const lead = matchLead(appointment, leads);
    return {
      ...appointment,
      leadId: lead ? lead.id : null,
      leadName: lead ? lead.name : null,
      leadArchived: Boolean(lead && lead.archivedAt),
    };
  });
}

/**
 * Crea el lead de una cita. Si la persona ya esta en el CRM devuelve ese lead
 * sin crear otro (un doble clic, o dos personas del equipo a la vez).
 *
 * @param {number} id
 * @returns {Promise<{lead: import("../types").Lead, created: boolean}|null>} null si la cita no existe
 */
async function addAppointmentToCrm(id) {
  const appointment = await getAppointment(id);
  if (!appointment) return null;

  const existing = matchLead(appointment, await listLeads({ includeArchived: true }));
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
      appointment_date: appointment.date,
      appointment_time: appointment.time,
      first_visit: appointment.firstVisit ? "Yes" : "No",
      service: appointment.service,
      insurance: appointment.insurance,
    },
  });
  return { lead, created: true };
}

module.exports = { listAppointmentsWithLeads, addAppointmentToCrm, matchLead, phoneKey };
