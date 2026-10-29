// Cron del CRM.
//
// Traduccion directa de src/lib/scheduler.ts, con una diferencia importante:
// aqui cada callback va envuelto en un try/catch. En el CRM Next.js un fallo de
// red en el tick se comia como una promesa rechazada y solo seectable en los
// logs de Vercel. Este proceso es el mismo que sirve las citas del calendario,
// asi que una excepcion sin capturar aqui puede tumbar las reservas.
//
// Ademas guarda `started` en el modulo en vez de en `global`, porque ya no hay
// hot reload de Next.js que lo ejecute dos veces.

const cron = require("node-cron");
const { checkFacebookTokenValidity } = require("./services/facebook/sync");
const { runTick } = require("./services/tick");

let started = false;

/**
 * @param {string} name
 * @param {() => Promise<unknown>} fn
 */
function safely(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      // Log y seguir. El calendario no puede caerse por un tick de Facebook.
      console.error(`[crm/scheduler] ${name} fallo:`, err instanceof Error ? err.message : err);
    }
  };
}

/**
 * Arranca los jobs. Idempotente: llamarla dos veces no duplica los crons.
 * @returns {boolean} true si arranco ahora, false si ya estaba arrancado
 */
function startScheduler() {
  if (started) return false;
  started = true;

  // Cada 5 minutos: traer leads nuevos de Facebook y luego evaluar las reglas
  // basadas en tiempo (p.ej. leads "Contacted" parados).
  // Pasa por runTick() y no llama al sync directo: asi comparte candado con
  // POST /crm/cron/tick (el Cron Jobs de cPanel) y no corren a la vez.
  cron.schedule("*/5 * * * *", safely("sync+automatizaciones", async () => {
    await runTick("cron interno");
  }));

  // Una vez al dia: comprobar que el Page Access Token sigue vivo, para que
  // Settings avise antes de que el sync de 5 minutos empiece a fallar solo.
  cron.schedule("0 8 * * *", safely("check del token de Facebook", () => checkFacebookTokenValidity()));

  // Tambien al arrancar, para que Settings tenga una respuesta fresca en vez de
  // esperar a las 8:00. No bloquea el arranque del servidor.
  void safely("check inicial del token de Facebook", () => checkFacebookTokenValidity())();

  console.log("[crm/scheduler] arrancado: sync de Facebook + automatizaciones cada 5 min, check de token diario");
  return true;
}

/** @returns {boolean} true si los crons ya estan arrancados (lo usa /health) */
function isStarted() {
  return started;
}

module.exports = { startScheduler, isStarted };
