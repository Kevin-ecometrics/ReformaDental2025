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
//
// Para no perder tambien el correo de confirmacion y la tarea de llamada, al
// terminar el paso 4 se marca crm_leads.effects_fired_at; el tick reprocesa los
// leads sin marca (recoverPendingLeadEffects). Los de un cambio de etapa tienen su
// propia marca, pending_stage_at (recoverPendingStageEffects).

const { withTransaction } = require("../db/connection");
const {
  getLead,
  getLeadByFbLeadgenId,
  insertLead,
  updateLeadStage,
  updateLeadNotes: repoUpdateLeadNotes,
  updateLeadContact: repoUpdateLeadContact,
  markEffectsFired,
  listLeadsPendingEffects,
  clearPendingStageEffects,
  listLeadsPendingStageEffects,
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
  await markEffectsFired(lead.id);

  return { lead, created: true };
}

/**
 * Cambia la etapa de un lead. La escritura y su actividad van en la misma
 * transaccion; los efectos, despues.
 *
 * @param {string} id
 * @param {string} newStage
 * @param {{taskDueAt?: string}} [options] vencimiento de las tareas que creen las reglas
 * @returns {Promise<import("../types").Lead|null>} null si el lead no existe
 */
async function changeLeadStage(id, newStage, options) {
  const { lead, changed, oldStage } = await withTransaction(async (tx) => {
    const result = await updateLeadStage(id, newStage, tx);
    if (result.changed) {
      await addActivity(id, "stage_change", `Stage changed: ${result.oldStage} → ${newStage}`, tx);
    }
    return result;
  });

  if (!lead) return null;
  if (!changed) return lead;

  await fireStageChangeSideEffects(lead, oldStage, newStage, options);
  // Si esto falla, el tick repite los efectos: CAPI lo descarta por event_id y la tarea no se duplica.
  try {
    await clearPendingStageEffects(id, newStage);
  } catch (err) {
    console.warn(`[crm/leads] no se pudo limpiar la marca de etapa de ${id}:`, err.message);
  }
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

/**
 * Edita los datos de contacto. No dispara CAPI ni reglas. La actividad guarda el
 * valor anterior, porque el UPDATE lo pierde.
 *
 * @param {string} id
 * @param {{name?: string, email?: string|null, phone?: string|null}} patch
 * @returns {Promise<import("../types").Lead|null>}
 */
async function updateLeadContact(id, patch) {
  return withTransaction(async (tx) => {
    const lead = await getLead(id, tx);
    if (!lead) return null;

    const changes = Object.keys(patch)
      .filter((field) => patch[field] !== lead[field])
      .map((field) => `${field}: ${lead[field] || "-"} → ${patch[field] || "-"}`);
    if (changes.length === 0) return lead;

    const updated = await repoUpdateLeadContact(id, patch, tx);
    await addActivity(id, "system", `Lead edited (${changes.join(", ")})`, tx);
    return updated;
  });
}

// Un createLead normal tarda segundos; con esta edad se descarta que siga en curso.
const PENDING_MIN_AGE_MS = 2 * 60 * 1000;
const PENDING_BATCH = 20;

/**
 * Segunda oportunidad para los efectos de creacion de leads que quedaron sin
 * marca (el proceso murio, o un efecto lanzo, entre insertar el lead y
 * terminar). Cada lead se intenta UNA vez: se marca aunque falle, para que un
 * fallo persistente no repita CAPI y correo en cada tick.
 *
 * @returns {Promise<number>} cuantos leads se reprocesaron
 */
async function recoverPendingLeadEffects() {
  const pending = await listLeadsPendingEffects(PENDING_MIN_AGE_MS, PENDING_BATCH);
  for (const lead of pending) {
    console.warn(`[crm/leads] reprocesando efectos de creacion del lead ${lead.id}`);
    try {
      await addActivity(lead.id, "system", "Creation effects re-run after an interrupted run");
      await fireStageChangeSideEffects(lead, null, "new");
    } catch (err) {
      console.error(`[crm/leads] efectos del lead ${lead.id} fallaron:`, err instanceof Error ? err.message : err);
    } finally {
      await markEffectsFired(lead.id);
    }
  }
  return pending.length;
}

/**
 * Segunda oportunidad para los efectos de un cambio de etapa, con la misma regla
 * que los de creacion: cada uno se intenta una vez, aunque falle. Si el lead cambio
 * varias veces antes del reinicio, solo se recupera el ultimo cambio.
 *
 * @param {(lead: import("../types").Lead) => Promise<{taskDueAt?: string}|undefined>} [optionsFor]
 *   vencimiento de las tareas; lo pasa quien llama porque depende de las citas
 * @returns {Promise<number>} cuantos se reprocesaron
 */
async function recoverPendingStageEffects(optionsFor) {
  const pending = await listLeadsPendingStageEffects(PENDING_MIN_AGE_MS, PENDING_BATCH);
  for (const { lead, oldStage } of pending) {
    console.warn(`[crm/leads] reprocesando efectos de etapa del lead ${lead.id}`);
    try {
      await addActivity(lead.id, "system", `Stage effects re-run after an interrupted run (${lead.stage})`);
      const options = optionsFor && lead.stage === "scheduled" ? await optionsFor(lead) : undefined;
      await fireStageChangeSideEffects(lead, oldStage, lead.stage, options);
    } catch (err) {
      console.error(`[crm/leads] efectos de etapa de ${lead.id} fallaron:`, err instanceof Error ? err.message : err);
    } finally {
      await clearPendingStageEffects(lead.id, lead.stage);
    }
  }
  return pending.length;
}

module.exports = {
  createLead,
  changeLeadStage,
  updateLeadNotes,
  updateLeadContact,
  recoverPendingLeadEffects,
  recoverPendingStageEffects,
};
