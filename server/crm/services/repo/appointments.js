// Lectura de la tabla `citas` del calendario, que vive en la misma base. El CRM
// solo la lee: las citas se crean, editan y borran desde las rutas del
// calendario en server.src.js.
//
// Fecha y hora se formatean en SQL para no pasar por Date: un DATE de MySQL
// convertido a Date en JS se corre de dia segun la zona horaria del servidor.

const { q, one, toIso } = require("../../db/connection");

const SELECT = `SELECT id, nombre_paciente AS name, telefono AS phone, correo AS email,
  DATE_FORMAT(fecha, '%Y-%m-%d') AS date, TIME_FORMAT(hora, '%H:%i') AS time,
  primera_visita AS firstVisit, servicio AS service, seguro AS insurance, origen AS origin, created_at
  FROM citas`;

/**
 * @typedef {object} Appointment
 * @property {number} id
 * @property {string} name
 * @property {string} phone
 * @property {string|null} email
 * @property {string} date YYYY-MM-DD
 * @property {string} time HH:MM
 * @property {boolean} firstVisit
 * @property {string} service
 * @property {string} insurance
 * @property {string} origin
 * @property {string|null} createdAt
 */

/** @returns {Appointment} */
function toAppointment(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || null,
    date: row.date,
    time: row.time,
    firstVisit: row.firstVisit === 1 || row.firstVisit === true,
    service: row.service || "",
    insurance: row.insurance || "",
    origin: row.origin || "web",
    createdAt: toIso(row.createdAt),
  };
}

/** @returns {Promise<Appointment[]>} las mas recientes primero */
async function listAppointments() {
  const rows = await q(`${SELECT} ORDER BY fecha DESC, hora DESC`);
  return rows.map(toAppointment);
}

/**
 * @param {number} id
 * @returns {Promise<Appointment|null>}
 */
async function getAppointment(id) {
  const row = await one(`${SELECT} WHERE id = ?`, [id]);
  return row ? toAppointment(row) : null;
}

module.exports = { listAppointments, getAppointment };
