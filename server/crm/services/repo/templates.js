// Acceso a crm_templates. PK compuesta (key, channel): la misma plantilla
// logica tiene una version por canal, igual que en la version lowdb.

const { q, one, run } = require("../../db/connection");

const COLUMNS =
  "`key`, channel, label, subject, body, whatsapp_template_name, whatsapp_template_language";

/**
 * @param {object} row
 * @returns {import("../../types").MessageTemplate}
 */
function toTemplate(row) {
  return {
    key: row.key,
    channel: row.channel,
    label: row.label,
    subject: row.subject ?? undefined,
    body: row.body,
    whatsappTemplateName: row.whatsappTemplateName ?? undefined,
    whatsappTemplateLanguage: row.whatsappTemplateLanguage ?? undefined,
  };
}

/** @typedef {import("./leads").Tx} Tx */

/**
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").MessageTemplate[]>}
 */
async function listTemplates(tx) {
  const db = tx || { q, one, run };
  const rows = await db.q(`SELECT ${COLUMNS} FROM crm_templates ORDER BY \`key\` ASC, channel ASC`);
  return rows.map(toTemplate);
}

/**
 * @param {string} key
 * @param {import("../../types").MessageChannel} channel
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").MessageTemplate|null>}
 */
async function getTemplate(key, channel, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(`SELECT ${COLUMNS} FROM crm_templates WHERE \`key\` = ? AND channel = ?`, [
    key,
    channel,
  ]);
  return row ? toTemplate(row) : null;
}

/**
 * UPSERT por (key, channel).
 * @param {import("../../types").MessageTemplate} template
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").MessageTemplate>}
 */
async function upsertTemplate(template, tx) {
  const db = tx || { q, one, run };
  await db.run(
    `INSERT INTO crm_templates (${COLUMNS})
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       subject = VALUES(subject),
       body = VALUES(body),
       whatsapp_template_name = VALUES(whatsapp_template_name),
       whatsapp_template_language = VALUES(whatsapp_template_language)`,
    [
      template.key,
      template.channel,
      template.label,
      template.subject ?? null,
      template.body,
      template.whatsappTemplateName ?? null,
      template.whatsappTemplateLanguage ?? null,
    ]
  );
  return template;
}

module.exports = { toTemplate, listTemplates, getTemplate, upsertTemplate };
