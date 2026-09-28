// Envio de SMS por Twilio.
//
// BLOQUEADO: falta que el dueno entregue TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
// / TWILIO_FROM_SMS_NUMBER (y en EU/US la registracion A2P 10DLC). El modulo
// queda escrito y degrada a un error claro, igual que antes, para que en
// cuanto lleguen las credenciales solo haya que rellenar las variables.
//
// `twilio` no esta en las dependencias todavia: se agrega en el mismo deploy en
// que se Depositan las claves, para no cargar un SDK grande en un proceso que
// tambien sirve el calendario sin usar la funcion.

/**
 * @typedef {object} SendResult
 * @property {boolean} ok
 * @property {string} [error]
 */

/** @type {any} */
let client = null;

/**
 * @returns {any|null} cliente de Twilio, o null si no esta configurado
 */
function getClient() {
  if (client) return client;

  const { CRM_TWILIO_ACCOUNT_SID, CRM_TWILIO_AUTH_TOKEN } = process.env;
  if (!CRM_TWILIO_ACCOUNT_SID || !CRM_TWILIO_AUTH_TOKEN) return null;

  let twilio;
  try {
    twilio = require("twilio");
  } catch {
    return null;
  }

  client = twilio(CRM_TWILIO_ACCOUNT_SID, CRM_TWILIO_AUTH_TOKEN);
  return client;
}

/**
 * Explica por que no se puede enviar, para que /crm/messaging-test devuelva algo
 * util en vez de un error generico.
 * @returns {string|null} null si todo esta listo
 */
function notConfiguredReason() {
  const missing = [];
  if (!process.env.CRM_TWILIO_ACCOUNT_SID) missing.push("CRM_TWILIO_ACCOUNT_SID");
  if (!process.env.CRM_TWILIO_AUTH_TOKEN) missing.push("CRM_TWILIO_AUTH_TOKEN");
  if (!process.env.CRM_TWILIO_FROM_SMS_NUMBER) missing.push("CRM_TWILIO_FROM_SMS_NUMBER");
  if (missing.length) {
    return `Twilio no esta configurado (faltan ${missing.join(", ")} en .env)`;
  }
  try {
    require.resolve("twilio");
  } catch {
    return "Twilio esta configurado pero el paquete 'twilio' no esta instalado en server/package.json";
  }
  return null;
}

/**
 * @param {string} to
 * @param {string} body
 * @returns {Promise<SendResult>}
 */
async function sendSms(to, body) {
  const reason = notConfiguredReason();
  if (reason) return { ok: false, error: reason };

  const twilioClient = getClient();
  if (!twilioClient) return { ok: false, error: "no se pudo inicializar el cliente de Twilio" };

  try {
    const message = await twilioClient.messages.create({
      to,
      from: process.env.CRM_TWILIO_FROM_SMS_NUMBER,
      body,
    });
    return { ok: true, sid: message.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { sendSms, notConfiguredReason };
