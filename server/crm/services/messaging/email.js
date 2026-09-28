// Envio de email.
//
// Reutiliza el transporte nodemailer del calendario cuando esta disponible
// (lo inyecta server.js). Si no lo esta -- por ejemplo si el CRM se monta solo
// para pruebas -- arma uno propio, preferiendo las variables CRM_SMTP_* y
// cayendo a las EMAIL_* que ya existen en el server.
//
// La unica variable de email que el CRM anade es CRM_SMTP_FROM: el calendario
// envia siempre desde EMAIL_USER y nunca necesito un "from" distinto, el CRM si.

const nodemailer = require("nodemailer");
const { getMailTransport } = require("./transport");

/**
 * @typedef {object} SendResult
 * @property {boolean} ok
 * @property {string} [error]
 */

/** @type {import('nodemailer').Transporter|null} */
let ownTransport = null;

/**
 * Construye (una sola vez) un transporte propio, para cuando el calendario no
 * inyecta el suyo.
 * @returns {import('nodemailer').Transporter}
 */
function buildOwnTransport() {
  if (ownTransport) return ownTransport;

  const host = process.env.CRM_SMTP_HOST || process.env.EMAIL_HOST;
  const user = process.env.CRM_SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.CRM_SMTP_PASS || process.env.EMAIL_PASS;
  const port = Number(process.env.CRM_SMTP_PORT || process.env.EMAIL_PORT || 465);

  if (!host || !user || !pass) {
    throw new Error(
      "Sin transporte SMTP: falta el del calendario y tampoco hay CRM_SMTP_HOST/USER/PASS ni EMAIL_HOST/USER/PASS"
    );
  }

  ownTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return ownTransport;
}

/**
 * @param {{to: string, subject: string, text: string}} input
 * @returns {Promise<SendResult>}
 */
async function sendEmail(input) {
  const from = process.env.CRM_SMTP_FROM || process.env.EMAIL_USER;
  if (!from) {
    return { ok: false, error: "CRM_SMTP_FROM no esta definido" };
  }

  let transport;
  try {
    transport = getMailTransport() || buildOwnTransport();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { sendEmail };
