// Endpoints de configuracion: el estado del sistema, las reglas de
// automatizacion y las plantillas de mensajes. Traduccion de
// src/app/api/settings/**.
//
// CAMBIO DE CONTRATO en las reglas: el CRM original las identificaba por un
// `id` generado (nanoid) y el PATCH /settings/rules/:id lo buscaba por ahi. En
// MySQL la PK es el `key` ("new_lead_call_task"), que es estable y permite que
// la semilla sea idempotente. El frontend de la Fase 2 debe usar el `key`.

const express = require("express");
const { asyncHandler } = require("./util");
const { listRules, upsertRule, getRule } = require("../services/repo/rules");
const { listTemplates, getTemplate, upsertTemplate } = require("../services/repo/templates");
const { getSyncState } = require("../services/repo/syncState");
const { listStages } = require("../services/repo/stages");
const { getMailTransport } = require("../services/messaging/transport");

const router = express.Router();

router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const [automationRules, templates, syncState, stages] = await Promise.all([
      listRules(),
      listTemplates(),
      getSyncState(),
      listStages(),
    ]);

    // `configured` solo mira si la variable existe, no si el servicio responde.
    // Es lo que hacia la version original, y Settings lo usa para mostrar
    // "conectado" o "falta configurarlo", no como un test de vida.
    const configured = {
      facebookLeadSync: Boolean(process.env.CRM_FB_PAGE_ACCESS_TOKEN && process.env.CRM_FB_PAGE_ID),
      facebookCapi: Boolean(process.env.CRM_FB_CAPI_ACCESS_TOKEN),
      facebookCapiTestMode: Boolean(process.env.CRM_FB_CAPI_TEST_EVENT_CODE),
      // El transporte del calendario cuenta como email configurado; el CRM solo
      // necesita ademas un remitente propio.
      email: Boolean(
        (getMailTransport() ||
          (process.env.CRM_SMTP_HOST || process.env.EMAIL_HOST)) &&
          (process.env.CRM_SMTP_FROM || process.env.EMAIL_USER)
      ),
      sms: Boolean(
        process.env.CRM_TWILIO_ACCOUNT_SID &&
          process.env.CRM_TWILIO_AUTH_TOKEN &&
          process.env.CRM_TWILIO_FROM_SMS_NUMBER
      ),
      whatsapp: Boolean(
        process.env.CRM_WHATSAPP_ACCESS_TOKEN && process.env.CRM_WHATSAPP_PHONE_NUMBER_ID
      ),
    };

    res.json({ automationRules, templates, syncState, stages, configured });
  })
);

router.patch(
  "/settings/rules/:id",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rule = await getRule(req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found" });

    // El endpoint original solo permitia activar o desactivar. Editar el
    // contenido de una regla (su config) es nuevo y sigue en el backlog: cambiar
    // el retardo de una tarea por una llamada accidental es facil de deshacer
    // y dificil de detectar.
    if (typeof body.enabled !== "boolean") {
      return res.json({ rule });
    }

    const updated = await upsertRule({ ...rule, enabled: body.enabled });
    return res.json({ rule: updated });
  })
);

router.patch(
  "/settings/templates",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { key, channel, text, subject, whatsappTemplateName, whatsappTemplateLanguage } = body;

    if (!key || !channel) {
      return res.status(400).json({ error: "key and channel are required" });
    }

    const template = await getTemplate(key, channel);
    if (!template) return res.status(404).json({ error: "Template not found" });

    // El body del request llama al cuerpo del mensaje `text`, igual que antes;
    // la columna se llama body. Se traduce en el upsert, no aqui.
    const updated = await upsertTemplate({
      ...template,
      body: typeof text === "string" ? text : template.body,
      subject: typeof subject === "string" ? subject : template.subject,
      whatsappTemplateName:
        typeof whatsappTemplateName === "string"
          ? whatsappTemplateName || undefined
          : template.whatsappTemplateName,
      whatsappTemplateLanguage:
        typeof whatsappTemplateLanguage === "string"
          ? whatsappTemplateLanguage || undefined
          : template.whatsappTemplateLanguage,
    });

    return res.json({ template: updated });
  })
);

module.exports = router;
