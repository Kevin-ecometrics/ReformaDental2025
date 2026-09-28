// Orquestador de envio a un lead.
//
// Traduccion directa de src/lib/messaging/index.ts del CRM Next.js, con la
// unica diferencia estructural: la plantilla y la actividad se leen/escriben
// con el repo de MySQL en vez de con el array en memoria de lowdb. La logica
// de decision --que canal, si hay destino, plantilla o texto libre-- se mantiene
// igual a proposito, para que las automatizaciones no cambien de comportamiento
// al migrar.

const { getTemplate } = require("../repo/templates");
const { addActivity } = require("../repo/activities");
const { sendEmail } = require("./email");
const { sendSms } = require("./sms");
const { sendWhatsapp, sendWhatsappTemplate } = require("./whatsapp");

/**
 * Sustituye {{name}}. Deliberadamente solo {{name}}: es el unico placeholder
 * que la version Next.js soportaba, y ampliarlo aqui sin migrar las plantillas
 * haria que unas llenaran el hueco y otras no.
 * @param {string} body
 * @param {import("../../types").Lead} lead
 * @returns {string}
 */
function renderTemplate(body, lead) {
  return body.replace(/{{\s*name\s*}}/gi, lead.name || "there");
}

/**
 * @typedef {object} SendMessageResult
 * @property {boolean} ok
 * @property {string} [error]
 */

/**
 * Envia la plantilla indicada al lead por el canal indicado y deja constancia
 * en el log del lead, salga bien o mal. Nunca lanza: siempre devuelve el
 * resultado, porque la mayoria de los llamadores (reglas de automatizacion,
 * endpoints de prueba) quieren registrar el fallo y seguir.
 *
 * @param {import("../../types").Lead} lead
 * @param {import("../../types").MessageChannel} channel
 * @param {string} templateKey
 * @returns {Promise<SendMessageResult>}
 */
async function sendMessageToLead(lead, channel, templateKey) {
  const template = await getTemplate(templateKey, channel);

  if (!template) {
    const error = `No "${templateKey}" template found for channel "${channel}"`;
    await addActivity(lead.id, "message_failed", error);
    return { ok: false, error };
  }

  const body = renderTemplate(template.body, lead);
  let result;

  if (channel === "email") {
    if (!lead.email) {
      result = { ok: false, error: "Lead has no email address" };
    } else {
      result = await sendEmail({
        to: lead.email,
        subject: renderTemplate(template.subject || "Reforma Dental", lead),
        text: body,
      });
    }
  } else if (channel === "sms") {
    result = lead.phone
      ? await sendSms(lead.phone, body)
      : { ok: false, error: "Lead has no phone number" };
  } else {
    if (!lead.phone) {
      result = { ok: false, error: "Lead has no phone number" };
    } else if (template.whatsappTemplateName) {
      // Plantilla aprobada: la unica que funciona fuera de la ventana de 24h.
      result = await sendWhatsappTemplate(
        lead.phone,
        template.whatsappTemplateName,
        template.whatsappTemplateLanguage || "en_US",
        [lead.name || "there"]
      );
    } else {
      // Texto libre: dentro de la ventana de 24h, o nunca llega.
      result = await sendWhatsapp(lead.phone, body);
    }
  }

  await addActivity(
    lead.id,
    result.ok ? "message_sent" : "message_failed",
    result.ok
      ? `Sent "${templateKey}" via ${channel}`
      : `Failed to send "${templateKey}" via ${channel}: ${result.error}`
  );

  return result;
}

module.exports = { renderTemplate, sendMessageToLead };
