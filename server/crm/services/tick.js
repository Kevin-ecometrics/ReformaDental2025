// Un ciclo del CRM: traer los leads de Facebook y despues evaluar las reglas
// basadas en tiempo (p.ej. leads "Contacted" parados).
//
// Lo llaman dos sitios: el cron interno (scheduler.js) y POST /crm/cron/tick, que
// es lo que dispara el Cron Jobs de cPanel. Viven aqui, en un modulo aparte, para
// que compartan candado: sin el, el cron interno y el de cPanel podrian correr el
// mismo ciclo a la vez.
//
// El candado es una variable del modulo, no una fila de MySQL. Vale mientras el
// hosting corra UN solo proceso de la app; si algun dia hubiera dos, cada uno
// tendria el suyo y haria falta moverlo a la base.
//
// runTick() nunca lanza: devuelve el resultado, con `ok: false` si algo fallo.

const { syncFacebookLeads } = require("./facebook/sync");
const { runAutomationTick } = require("./automation");
const { recoverPendingLeadEffects, recoverPendingStageEffects } = require("./leads");
const { processNewAppointments, processRecentLeads, scheduledTaskOptions } = require("./appointments");

// Un ciclo normal dura segundos. Si el candado lleva tanto tiempo cerrado es que
// algo se colgo (el fetch a Facebook no tiene timeout propio), y no puede dejar
// al CRM sin ciclos para siempre.
const LOCK_MAX_MS = 10 * 60 * 1000;

// Margen contra el doble disparo: el cron interno y el de cPanel caen en el mismo
// minuto. El segundo se omite en vez de repetir el sync a Facebook.
const MIN_GAP_MS = 60 * 1000;

/**
 * @typedef {object} TickResult
 * @property {boolean} ok
 * @property {string} source quien lo disparo ("cron interno", "http")
 * @property {string} startedAt ISO
 * @property {string} finishedAt ISO
 * @property {number} durationMs
 * @property {{ok: boolean, fetched: number, created: number, error?: string}} sync
 * @property {{ok: boolean, error?: string}} automation
 */

let runningSince = null;
/** @type {TickResult|null} */
let lastTick = null;

/**
 * @param {string} source
 * @returns {Promise<TickResult | {skipped: true, reason: string}>}
 */
async function runTick(source) {
  const nowMs = Date.now();

  if (runningSince !== null) {
    if (nowMs - runningSince < LOCK_MAX_MS) {
      return { skipped: true, reason: "ya hay un tick en curso" };
    }
    console.warn("[crm/tick] el candado llevaba mas de 10 min cerrado; se libera");
  }

  if (lastTick && nowMs - Date.parse(lastTick.finishedAt) < MIN_GAP_MS) {
    return { skipped: true, reason: "hubo un tick hace menos de un minuto" };
  }

  runningSince = nowMs;
  const startedAt = new Date(nowMs);

  /** @type {TickResult["sync"]} */
  let sync = { ok: false, fetched: 0, created: 0 };
  /** @type {TickResult["automation"]} */
  let automation = { ok: false };

  try {
    try {
      sync = await syncFacebookLeads();
    } catch (err) {
      sync = { ok: false, fetched: 0, created: 0, error: errorMessage(err) };
    }

    // Las reglas corren aunque el sync falle: dependen de los leads que ya estan
    // en la base, no de que Facebook haya contestado.
    let automationError = null;
    try {
      await runAutomationTick();
    } catch (err) {
      automationError = err;
    }
    // Efectos de creacion que un reinicio dejo a medias (ver services/leads.js).
    try {
      await recoverPendingLeadEffects();
    } catch (err) {
      automationError = automationError || err;
    }
    // Cada paso aparte: que falle uno no debe impedir los demas.
    for (const step of [
      () => recoverPendingStageEffects(scheduledTaskOptions),
      // Despues del sync, para cruzar las citas con los leads que acaban de llegar.
      processNewAppointments,
      processRecentLeads,
    ]) {
      try {
        await step();
      } catch (err) {
        automationError = automationError || err;
      }
    }
    automation = automationError ? { ok: false, error: errorMessage(automationError) } : { ok: true };
  } finally {
    runningSince = null;
  }

  const finishedAt = new Date();
  lastTick = {
    ok: sync.ok && automation.ok,
    source,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sync,
    automation,
  };

  if (!lastTick.ok) {
    console.error(
      `[crm/tick] (${source}) con errores:`,
      sync.error || "",
      automation.error || ""
    );
  }

  return lastTick;
}

/** @param {unknown} err */
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Ultimo tick terminado, sin el detalle de errores. Lo usa /health, que es
 * publico: solo hora, resultado, origen y duracion.
 * @returns {{ok: boolean, source: string, finishedAt: string, durationMs: number}|null}
 */
function getLastTick() {
  if (!lastTick) return null;
  const { ok, source, finishedAt, durationMs } = lastTick;
  return { ok, source, finishedAt, durationMs };
}

module.exports = { runTick, getLastTick };
