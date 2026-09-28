// Capa de servicio de leads: la orquestacion que en la version Next.js vivia
// dentro de src/lib/leads.ts.
//
// El repo (crm/services/repo/leads.js) solo escribe filas y no sabe nada de
// efectos. Aqui se junta todo, con el mismo orden que el original:
//
//   1. deduplicar por fbLeadgenId
//   2. escribir el lead
//   3. registrar la actividad
//   4. disparar los efectos de etapa (CAPI + reglas)
//
// El paso 4 va FUERA de la transaccion a proposito: son llamadas de red a Meta y
// a SMTP, y mantener abierta una transaccion de MySQL mientras se espera a una
// API externa es como se bloquea la tabla. Si el proceso muere entre 2 y 4 se
// pierde el CAPI, que es el trade-off correcto: el lead escrito es la verdad.

const { withTransaction } = require("../db/connection");
const {
  getLeadByFbLeadgenId,
  insertLead,
  updateLeadStage,
  updateLeadNotes: repoUpdateLeadNotes,
} = require("./repo/leads");
const { addActivity } = require("./repo/activities");
const { fireStageChangeSideEffects } = require("./automation");

/**
 * @typedef {object} CreateLeadResult
 * @property {import("../types").Lead|null} lead
 * @property {boolean} created
 */

/**
 * Crea un lead. Si ya existe uno con el mismo fbLeadgenId devuelve el
 * existente sin escribir ni disparar efectos, igual que el original: por eso el
 * sync de Facebook puede releer los mismos formularios en cada tick sin
 * duplicar.
 *
 * @param {import("../types").CreateLeadInput} input
 * @returns {Promise<CreateLeadResult>}
 */
async function createLead(input) {
  if (input.fbLeadgenId) {
    const existing = await getLeadByFbLeadgenId(input.fbLeadgenId);
    if (existing) return { lead: existing, created: false };
  }

  const lead = await withTransaction((tx) => insertLead(input, tx));

  await addActivity(lead.id, "system", `Lead created via ${input.source}`);
  await fireStageChangeSideEffects(lead, null, "new");

  return { lead, created: true };
}

/**
 * Cambia la etapa de un lead. La escritura y su actividad van en la misma
 * transaccion; los efectos, despues.
 *
 * @param {string} id
 * @param {string} newStage
 * @returns {Promise<import("../types").Lead|null>} null si el lead no existe
 */
async function changeLeadStage(id, newStage) {
  const { lead, changed, oldStage } = await withTransaction(async (tx) => {
    const result = await updateLeadStage(id, newStage, tx);
    if (result.changed) {
      await addActivity(id, "stage_change", `Stage changed: ${result.oldStage} → ${newStage}`, tx);
    }
    return result;
  });

  if (!lead) return null;
  if (!changed) return lead;

  await fireStageChangeSideEffects(lead, oldStage, newStage);
  return lead;
}

/**
 * @param {string} id
 * @param {string} notes
 * @returns {Promise<import("../types").Lead|null>}
 */
async function updateLeadNotes(id, notes) {
  return withTransaction(async (tx) => {
    const updated = await repoUpdateLeadNotes(id, notes, tx);
    if (updated) await addActivity(id, "note", notes, tx);
    return updated;
  });
}

module.exports = { createLead, changeLeadStage, updateLeadNotes };
