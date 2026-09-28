// Acceso a crm_stages. Solo lectura desde la API: las etapas son fijas y se
// siembran desde crm/seed.js. No hay endpoint para crearlas ni editarlas.

const { q, one, run } = require("../../db/connection");

/**
 * @param {object} row
 * @returns {import("../../types").Stage}
 */
function toStage(row) {
  return { id: row.id, name: row.name, order: row.order, color: row.color };
}

/** @typedef {import("./leads").Tx} Tx */

/**
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Stage[]>} ordenadas por `order`
 */
async function listStages(tx) {
  const db = tx || { q, one, run };
  const rows = await db.q("SELECT id, name, `order`, color FROM crm_stages ORDER BY `order` ASC");
  return rows.map(toStage);
}

/**
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Stage|null>}
 */
async function getStage(id, tx) {
  const db = tx || { q, one, run };
  const row = await db.one("SELECT id, name, `order`, color FROM crm_stages WHERE id = ?", [id]);
  return row ? toStage(row) : null;
}

module.exports = { toStage, listStages, getStage };
