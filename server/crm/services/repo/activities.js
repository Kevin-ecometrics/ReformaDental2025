// Acceso a crm_activities: el log por lead (creado, cambio de etapa, envio,
// evento CAPI). Append-only; no hay endpoint para borrarlas.

const crypto = require("node:crypto");
const { q, one, run, now, toIso } = require("../../db/connection");
const { currentUserName } = require("../../requestUser");

const COLUMNS = "id, lead_id, type, content, actor, created_at";

/**
 * @param {object} row
 * @returns {import("../../types").Activity}
 */
function toActivity(row) {
  return {
    id: row.id,
    leadId: row.leadId,
    type: row.type,
    content: row.content ?? "",
    actor: row.actor ?? null,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * @typedef {import("./leads").Tx} Tx
 */

/**
 * Registra una actividad. Llamar dentro de la misma transaccion que el cambio
 * que la origina, para que el log nunca describa algo que no ocurrio.
 * @param {string} leadId
 * @param {import("../../types").ActivityType} type
 * @param {string} content
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Activity>}
 */
async function addActivity(leadId, type, content, tx) {
  const db = tx || { q, one, run };
  const id = crypto.randomUUID();
  const createdAt = now();
  const actor = currentUserName();

  await db.run(
    "INSERT INTO crm_activities (id, lead_id, type, content, actor, created_at) VALUES (?,?,?,?,?,?)",
    [id, leadId, type, content, actor, createdAt]
  );

  return { id, leadId, type, content, actor, createdAt: toIso(createdAt) };
}

/**
 * @param {string} [leadId] si se omite, devuelve el log completo
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Activity[]>}
 */
async function listActivities(leadId, tx) {
  const db = tx || { q, one, run };
  const rows = leadId
    ? await db.q(`SELECT ${COLUMNS} FROM crm_activities WHERE lead_id = ? ORDER BY created_at DESC`, [leadId])
    : await db.q(`SELECT ${COLUMNS} FROM crm_activities ORDER BY created_at DESC`);
  return rows.map(toActivity);
}

module.exports = { toActivity, addActivity, listActivities };
