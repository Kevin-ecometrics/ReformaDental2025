// Acceso a crm_leads.
//
// Cada funcion acepta un `tx` opcional: si se pasa (el de withTransaction) usa
// esa conexion, si no usa el pool directo. Asi un cambio de etapa y su
// actividad pueden ir en la misma transaccion sin que este modulo sepa nada
// de transacciones.

const crypto = require("node:crypto");
const { q, one, run, now, fromIso, toIso, parseJson, stringifyJson } = require("../../db/connection");

/** Columnas de crm_leads en el orden del SELECT base. */
const COLUMNS = "id, fb_leadgen_id, name, email, phone, source, campaign_name, ad_name, form_name, field_data_raw, stage, notes, created_at, updated_at, archived_at";

/**
 * Normaliza una fila de la base al shape de la API: JSON parseado y DATETIME
 * en ISO.
 * @param {object|null} row
 * @returns {import("../../types").Lead|null}
 */
function toLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    fbLeadgenId: row.fbLeadgenId ?? null,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    source: row.source,
    campaignName: row.campaignName ?? null,
    adName: row.adName ?? null,
    formName: row.formName ?? null,
    fieldDataRaw: parseJson(row.fieldDataRaw),
    stage: row.stage,
    notes: row.notes ?? "",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    archivedAt: toIso(row.archivedAt),
  };
}

/**
 * @typedef {object} Tx
 * @property {typeof q} q
 * @property {typeof one} one
 * @property {typeof run} run
 */

/**
 * Leads del mas nuevo al mas viejo. Sin los archivados salvo que se pidan: asi
 * el pipeline, el dashboard, el CSV y la regla de 48 h los ignoran sin tocar a
 * cada llamador.
 * @param {{includeArchived?: boolean}} [options]
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead[]>}
 */
async function listLeads(options = {}, tx) {
  const db = tx || { q, one, run };
  const where = options.includeArchived ? "" : "WHERE archived_at IS NULL";
  const rows = await db.q(`SELECT ${COLUMNS} FROM crm_leads ${where} ORDER BY created_at DESC`);
  return rows.map(toLead);
}

/**
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead|null>}
 */
async function getLead(id, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(`SELECT ${COLUMNS} FROM crm_leads WHERE id = ?`, [id]);
  return toLead(row);
}

/**
 * Busca un lead por su id de Facebook Lead Ads. Es la unica deduplicacion que
 * existe hoy: la automatica por email/telefono sigue pendiente en el backlog,
 * por eso los indices de email y phone en el schema no son UNIQUE.
 * @param {string} fbLeadgenId
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead|null>}
 */
async function getLeadByFbLeadgenId(fbLeadgenId, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(`SELECT ${COLUMNS} FROM crm_leads WHERE fb_leadgen_id = ?`, [fbLeadgenId]);
  return toLead(row);
}

/**
 * Inserta un lead. NO dispara efectos: eso lo hace el llamador, para que la
 * escritura y los side effects (CAPI, reglas) puedan separarse.
 * @param {import("../../types").CreateLeadInput} input
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead>}
 */
async function insertLead(input, tx) {
  const db = tx || { q, one, run };
  const id = crypto.randomUUID();
  const ts = now();

  await db.run(
    `INSERT INTO crm_leads
       (id, fb_leadgen_id, name, email, phone, source, campaign_name, ad_name, form_name,
        field_data_raw, stage, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      input.fbLeadgenId ?? null,
      input.name,
      input.email ?? null,
      input.phone ?? null,
      input.source,
      input.campaignName ?? null,
      input.adName ?? null,
      input.formName ?? null,
      stringifyJson(input.fieldDataRaw),
      "new",
      input.notes ?? "",
      ts,
      ts,
    ]
  );

  return {
    id,
    fbLeadgenId: input.fbLeadgenId ?? null,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: input.source,
    campaignName: input.campaignName ?? null,
    adName: input.adName ?? null,
    formName: input.formName ?? null,
    fieldDataRaw: input.fieldDataRaw ?? null,
    stage: "new",
    notes: input.notes ?? "",
    createdAt: toIso(ts),
    updatedAt: toIso(ts),
  };
}

/**
 * Cambia la etapa. Valida que la etapa exista y que sea un cambio real: si el
 * destino no existe o ya era la actual, no escribe nada y devuelve el lead
 * intacto. Igual que la version lowdb.
 * @param {string} id
 * @param {string} newStage
 * @param {Tx} [tx]
 * @returns {Promise<{lead: import("../../types").Lead, changed: boolean, oldStage: string|null}>}
 */
async function updateLeadStage(id, newStage, tx) {
  const db = tx || { q, one, run };
  const lead = await getLead(id, db);
  if (!lead) return { lead: null, changed: false, oldStage: null };

  const stageExists = await db.one("SELECT id FROM crm_stages WHERE id = ?", [newStage]);
  if (!stageExists) return { lead, changed: false, oldStage: null };
  if (lead.stage === newStage) return { lead, changed: false, oldStage: null };

  await db.run("UPDATE crm_leads SET stage = ?, updated_at = ? WHERE id = ?", [
    newStage,
    now(),
    id,
  ]);

  return {
    lead: { ...lead, stage: newStage, updatedAt: toIso(now()) },
    changed: true,
    oldStage: lead.stage,
  };
}

/**
 * Reemplaza las notas.
 * @param {string} id
 * @param {string} notes
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead|null>}
 */
async function updateLeadNotes(id, notes, tx) {
  const db = tx || { q, one, run };
  const lead = await getLead(id, db);
  if (!lead) return null;

  const ts = now();
  await db.run("UPDATE crm_leads SET notes = ?, updated_at = ? WHERE id = ?", [notes, ts, id]);
  return { ...lead, notes, updatedAt: toIso(ts) };
}

/**
 * Archiva (fecha) o restaura (null). No toca etapa, notas ni tareas.
 * @param {string} id
 * @param {boolean} archived
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead|null>}
 */
async function setLeadArchived(id, archived, tx) {
  const db = tx || { q, one, run };
  const lead = await getLead(id, db);
  if (!lead) return null;

  const ts = now();
  const archivedAt = archived ? ts : null;
  await db.run("UPDATE crm_leads SET archived_at = ?, updated_at = ? WHERE id = ?", [archivedAt, ts, id]);
  return { ...lead, archivedAt: toIso(archivedAt), updatedAt: toIso(ts) };
}

/**
 * Marca actividad en el lead sin cambiar nada mas. La regla "sin actividad"
 * (stale_contacted) mide updated_at, y completar una tarea o mandar un mensaje
 * tambien es trabajar el lead: sin esto la regla vuelve a crear la tarea en el
 * siguiente tick.
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<void>}
 */
async function touchLead(id, tx) {
  const db = tx || { q, one, run };
  await db.run("UPDATE crm_leads SET updated_at = ? WHERE id = ?", [now(), id]);
}

/**
 * Marca que los efectos de creacion del lead (CAPI + reglas new_lead) ya
 * corrieron. Si el proceso muere antes de esto, el lead queda sin marca y el
 * tick lo reprocesa (ver recoverPendingLeadEffects en services/leads.js).
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<void>}
 */
async function markEffectsFired(id, tx) {
  const db = tx || { q, one, run };
  await db.run("UPDATE crm_leads SET effects_fired_at = ? WHERE id = ?", [now(), id]);
}

/**
 * Leads cuyos efectos de creacion no se marcaron como hechos. `minAgeMs` evita
 * agarrar un lead cuyo createLead sigue en curso en este mismo momento.
 * @param {number} minAgeMs
 * @param {number} limit
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Lead[]>}
 */
async function listLeadsPendingEffects(minAgeMs, limit, tx) {
  const db = tx || { q, one, run };
  const cutoff = fromIso(new Date(Date.now() - minAgeMs).toISOString());
  const rows = await db.q(
    `SELECT ${COLUMNS} FROM crm_leads WHERE effects_fired_at IS NULL AND created_at < ? ORDER BY created_at ASC LIMIT ?`,
    [cutoff, limit]
  );
  return rows.map(toLead);
}

module.exports = {
  COLUMNS,
  toLead,
  listLeads,
  getLead,
  getLeadByFbLeadgenId,
  insertLead,
  updateLeadStage,
  updateLeadNotes,
  setLeadArchived,
  touchLead,
  markEffectsFired,
  listLeadsPendingEffects,
};
