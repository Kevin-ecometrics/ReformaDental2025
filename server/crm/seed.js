// Semilla de etapas, reglas y plantillas.
//
// Estas tres tablas son la parte del CRM que NO viene de fuera: son la
// configuracion del negocio, y por eso se siembran versionadas en el codigo en
// lugar de migrarse desde db.json. Ejecutar dos veces no cambia nada, asi que
// se puede correr en cada deploy sin miedo.
//
// NO lo llama el arranque del servidor a proposito. El calendario y el CRM
// comparten el mismo MySQL, y si el CRM hiciera DDL al arrancar fallaria en el
// primer arranque por credenciales incompletas. Se corre a mano una vez, desde
// la terminal de cPanel:
//
//     node crm/seed.js
//
// Crea lo que falte y actualiza lo que exista; no borra nada que este en la
// base pero no en esta lista (salvo las filas stale de crm_sync_state, que se
// documentan abajo).

const { run } = require("./db/connection");

const STAGES = [
  { id: "new", name: "New", order: 0, color: "#545758" },
  { id: "contacted", name: "Contacted", order: 1, color: "#73CFED" },
  { id: "scheduled", name: "Scheduled", order: 2, color: "#4F646F" },
  { id: "consultation", name: "Consultation", order: 3, color: "#8AA6AE" },
  { id: "won", name: "Won", order: 4, color: "#AED136" },
  { id: "lost", name: "Lost", order: 5, color: "#ef4444" },
];

const RULES = [
  {
    key: "new_lead_call_task",
    label: 'New lead arrives → create "Call within 1 hour" task',
    trigger: "new_lead",
    action: "create_task",
    enabled: true,
    config: { delayHours: 1, taskDescription: "Call within 1 hour" },
  },
  {
    // Desactivada a proposito: se enciende cuando haya plantillas de email
    // aprobadas y un remitente verificado en el dominio.
    key: "new_lead_confirmation_message",
    label: "New lead arrives → send confirmation message",
    trigger: "new_lead",
    action: "send_message",
    enabled: false,
    config: { channel: "email", templateKey: "new-lead-confirmation" },
  },
  {
    key: "stale_contacted_followup_task",
    label: 'Contacted > 48h with no activity → create "Follow up again" task',
    trigger: "stale_contacted",
    action: "create_task",
    enabled: true,
    config: { staleHours: 48, taskDescription: "Follow up again" },
  },
  {
    key: "scheduled_reminder_task",
    label: "Stage → Scheduled → create appointment reminder task",
    trigger: "stage_change",
    action: "create_task",
    enabled: true,
    config: { stage: "scheduled", taskDescription: "Appointment reminder (1 day before)" },
  },
  {
    // Desactivada a proposito: depende de Twilio, que todavia no esta
    // configurado (ver crm/services/messaging/sms.js).
    key: "scheduled_reminder_message",
    label: "Stage → Scheduled → send appointment reminder message",
    trigger: "stage_change",
    action: "send_message",
    enabled: false,
    config: { stage: "scheduled", channel: "sms", templateKey: "appointment-reminder" },
  },
];

const TEMPLATES = [
  {
    key: "new-lead-confirmation",
    channel: "email",
    label: "New lead confirmation (email)",
    subject: "Gracias por contactar a Reforma Dental",
    body:
      "Hola {{name}},\n\nGracias por tu interes en Reforma Dental. Un miembro de nuestro equipo te contactara en breve para agendar tu cita.\n\nSaludos,\nReforma Dental",
  },
  {
    key: "new-lead-confirmation",
    channel: "sms",
    label: "New lead confirmation (SMS)",
    body:
      "Hola {{name}}, gracias por contactar a Reforma Dental. Te llamaremos pronto para agendar tu cita.",
  },
  {
    key: "new-lead-confirmation",
    channel: "whatsapp",
    label: "New lead confirmation (WhatsApp)",
    body: "Hola {{name}}! Gracias por contactar a Reforma Dental. Te contactaremos pronto para agendar tu cita.",
  },
  {
    key: "appointment-reminder",
    channel: "sms",
    label: "Appointment reminder (SMS)",
    body:
      "Hola {{name}}, te recordamos tu cita en Reforma Dental. Si necesitas reagendar, responde a este mensaje.",
  },
  {
    key: "appointment-reminder",
    channel: "whatsapp",
    label: "Appointment reminder (WhatsApp)",
    body: "Hola {{name}}! Te recordamos tu proxima cita en Reforma Dental.",
  },
  {
    key: "appointment-reminder",
    channel: "email",
    label: "Appointment reminder (email)",
    subject: "Recordatorio de tu cita — Reforma Dental",
    body: "Hola {{name}},\n\nTe recordamos tu proxima cita en Reforma Dental.\n\nSaludos,\nReforma Dental",
  },
];

/**
 * @returns {Promise<void>}
 */
async function seed() {
  for (const stage of STAGES) {
    await run(
      "INSERT INTO crm_stages (id, name, `order`, color) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), `order` = VALUES(`order`), color = VALUES(color)",
      [stage.id, stage.name, stage.order, stage.color]
    );
  }
  console.log(`[seed] ${STAGES.length} etapas`);

  for (const rule of RULES) {
    await run(
      "INSERT INTO crm_automation_rules (`key`, label, trigger_type, action, enabled, config) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE label = VALUES(label), trigger_type = VALUES(trigger_type), action = VALUES(action), enabled = VALUES(enabled), config = VALUES(config)",
      [
        rule.key,
        rule.label,
        rule.trigger,
        rule.action,
        rule.enabled,
        JSON.stringify(rule.config),
      ]
    );
  }
  console.log(`[seed] ${RULES.length} reglas`);

  for (const template of TEMPLATES) {
    await run(
      "INSERT INTO crm_templates (`key`, channel, label, subject, body, whatsapp_template_name, whatsapp_template_language) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE label = VALUES(label), subject = VALUES(subject), body = VALUES(body), whatsapp_template_name = VALUES(whatsapp_template_name), whatsapp_template_language = VALUES(whatsapp_template_language)",
      [
        template.key,
        template.channel,
        template.label,
        template.subject ?? null,
        template.body,
        null,
        null,
      ]
    );
  }
  console.log(`[seed] ${TEMPLATES.length} plantillas`);
}

// Solo se ejecuta si se llama directamente, no al importar el modulo.
if (require.main === module) {
  // El servidor carga .env en server.js; este script corre solo, asi que lo
  // carga aqui para tener MYSQL_* disponibles.
  require("dotenv").config();

  const { q, databaseName, useStandalonePool } = require("./db/connection");

  const pool = useStandalonePool();

  q("SELECT 1")
    .then(() => {
      console.log(`[seed] conectado a ${databaseName()}`);
      return seed();
    })
    .then(() => {
      console.log("[seed] listo");
      pool.end(() => process.exit(0));
    })
    .catch((err) => {
      console.error("[seed] fallo:", err.message);
      pool.end(() => process.exit(1));
    });
}

module.exports = { seed, STAGES, RULES, TEMPLATES };
