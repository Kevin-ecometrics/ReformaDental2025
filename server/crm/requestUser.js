// Quien hace la peticion en curso, sin pasarlo por cada funcion.
//
// requireAuth abre el contexto y addActivity lo lee, asi que todo lo que escribe
// en el historial queda firmado sin tocar a cada llamador. Fuera de una peticion
// (el cron) no hay usuario: la actividad queda sin autor, que significa "el sistema".

const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

/**
 * @param {string} name
 * @param {() => void} fn
 */
function runAsUser(name, fn) {
  storage.run(name, fn);
}

/** @returns {string|null} */
function currentUserName() {
  return storage.getStore() ?? null;
}

module.exports = { runAsUser, currentUserName };
