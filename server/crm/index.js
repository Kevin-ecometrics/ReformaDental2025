// Punto de entrada del modulo CRM dentro del Express de Reforma Dental.
//
// server.js lo monta con:
//
//     app.use("/crm", require("./crm").mount({ db, mail, allowedOrigins }));
//
// y a partir de ahi quedan disponibles /crm/login, /crm/leads, /crm/dashboard,
// etc. Es el unico punto donde el CRM toca lo que comparte con el calendario: el
// pool de MySQL y el transporte de nodemailer. Todo lo demas es interno del
// modulo.
//
// Lo que este archivo NO hace, a proposito:
//   - no crea el pool (lo recibe)
//   - no crea el transporte de email (lo recibe)
//   - no ejecuta DDL (schema.sql se aplica a mano, una vez)
//   - no arranca el servidor (lo hace server.js)

const express = require("express");

const connection = require("./db/connection");
const { setMailTransport } = require("./services/messaging/transport");
const { startScheduler } = require("./scheduler");
const { requireAuth, requireSameOrigin } = require("./auth");

const authRoutes = require("./routes/auth");
const leadRoutes = require("./routes/leads");
const dashboardRoutes = require("./routes/dashboard");
const settingsRoutes = require("./routes/settings");
const toolRoutes = require("./routes/tools");

/**
 * @typedef {object} MountDeps
 * @property {import('mysql').Pool} db pool que ya creo server.js
 * @property {import('nodemailer').Transporter} mail transporte del calendario
 * @property {string[]} [allowedOrigins] los mismos origenes que acepta el CORS
 *   de server.js, para el chequeo CSRF de las escrituras
 */

/**
 * @param {MountDeps} deps
 * @returns {import('express').Router}
 */
function mount(deps) {
  const { db, mail, allowedOrigins } = deps || {};

  if (!db) throw new Error("crm: mount() necesita el pool de MySQL (db)");
  if (!mail) throw new Error("crm: mount() necesita el transporte de email (mail)");

  connection.setPool(db);
  setMailTransport(mail);

  // La cookie de sesion es SameSite=None porque el dashboard (e-commetrics.com)
  // y esta API (reformadental.com) son sitios distintos. Eso deja la proteccion
  // CSRF de SameSite inservible, asi que se comprueba el Origin a mano en cada
  // escritura. Va antes de las rutas para que aplique a todas.
  const sameOrigin = requireSameOrigin(allowedOrigins);

  const router = express.Router();

  // /crm/login va SIN requireAuth a proposito: es la puerta de entrada y
  // obviously no puede exigir una sesion que todavia no existe. /crm/logout y
  // /crm/me tampoco la exigen: logout solo borra la cookie y /crm/me responde
  // {user:null} para que el frontend pueda preguntar "¿tengo sesion?" sin
  // tratar un 401 como error.
  router.use(sameOrigin, authRoutes);

  // Todo lo demas, autenticado. Cada router lleva su propio requireAuth para
  // que anadir un archivo nuevo en routes/ no pueda quedar sin proteger por
  // olvido: si se olvida el middleware, las rutas devuelven 401, no 200.
  router.use(sameOrigin, requireAuth, leadRoutes);
  router.use(sameOrigin, requireAuth, dashboardRoutes);
  router.use(sameOrigin, requireAuth, settingsRoutes);
  router.use(sameOrigin, requireAuth, toolRoutes);

  // El cron se arranca aqui, no en server.js: el calendario no depende de el.
  // Si el CRM se desmonta, el calendario sigue con sus citas.
  startScheduler();

  console.log("[crm] montado en /crm");
  return router;
}

module.exports = { mount };
