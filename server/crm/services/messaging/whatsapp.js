// Envio por WhatsApp Cloud API (Meta).
//
// Logica heredada tal cual de la version Next.js, con los gotchas ya
// documentados en el backlog:
//   - El texto libre solo se entrega dentro de la ventana de 24h del lead.
//     Fuera de esa ventana la API responde 200 con un message id y el mensaje
//     NUNCA llega. Por eso todo primer contacto tiene que ir por plantilla.
//   - El paquete `twilio` no se usa aqui; esto es Graph API directo con fetch.

const FB_API_VERSION = "v26.0";

/**
 * @typedef {object} WhatsappSendResult
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string} [messageId]
 */

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<WhatsappSendResult>}
 */
async function postWhatsappMessage(payload) {
  const { CRM_WHATSAPP_ACCESS_TOKEN, CRM_WHATSAPP_PHONE_NUMBER_ID } = process.env;

  if (!CRM_WHATSAPP_ACCESS_TOKEN || !CRM_WHATSAPP_PHONE_NUMBER_ID) {
    return {
      ok: false,
      error: "CRM_WHATSAPP_ACCESS_TOKEN/CRM_WHATSAPP_PHONE_NUMBER_ID no estan definidos en .env",
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${CRM_WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CRM_WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json().catch(() => undefined);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(json)}` };
    }

    const messageId =
      json && json.messages && json.messages[0] && json.messages[0].id ? json.messages[0].id : undefined;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * @param {string} phone
 * @returns {string} solo digitos, como exige la API
 */
function toE164Digits(phone) {
  return String(phone).replace(/\D/g, "");
}

/**
 * Texto libre. Solo llega dentro de la ventana de 24 horas; ver la nota de
 * arriba. Para iniciar contacto con un lead nuevo usar sendWhatsappTemplate().
 * @param {string} to
 * @param {string} body
 * @returns {Promise<WhatsappSendResult>}
 */
async function sendWhatsapp(to, body) {
  return postWhatsappMessage({
    messaging_product: "whatsapp",
    to: toE164Digits(to),
    type: "text",
    text: { body },
  });
}

/**
 * Plantilla preaprobada: funciona fuera de la ventana de 24h, asi que es la
 * unica forma fiable de alcanzar a un lead que no nos escribio primero. La
 * plantilla tiene que existir y estar Approved en WhatsApp -> Message Templates
 * de Meta Business Manager; name y languageCode deben coincidir exactamente.
 *
 * @param {string} to
 * @param {string} templateName
 * @param {string} languageCode
 * @param {string[]} [bodyParams] valores para los {{1}}, {{2}}... de la plantilla
 * @returns {Promise<WhatsappSendResult>}
 */
async function sendWhatsappTemplate(to, templateName, languageCode, bodyParams = []) {
  return postWhatsappMessage({
    messaging_product: "whatsapp",
    to: toE164Digits(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });
}

module.exports = { sendWhatsapp, sendWhatsappTemplate, toE164Digits };
