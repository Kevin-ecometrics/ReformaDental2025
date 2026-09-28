// Acceso a crm_automation_rules.
//
// La PK es `key`, no un id: el endpoint PATCH /crm/rules/:id recibe el key y
// hace UPSERT. Asi una regla nueva no necesita id generado y los seeds de
// crm/seed.js son idempotentes.

const { q, one, run, stringifyJson, parseJson } = require("../../db/connection");

/**
 * @param {object} row
 * @returns {import("../../types").AutomationRule}
 */
function toRule(row) {
  return {
    key: row.key,
    label: row.label,
    trigger: row.triggerType,
    action: row.action,
    enabled: row.enabled === 1 || row.enabled === true,
    config: parseJson(row.config) || {},
  };
}

/** @typedef {import("./leads").Tx} Tx */

/**
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").AutomationRule[]>}
 */
async function listRules(tx) {
  const db = tx || { q, one, run };
  const rows = await db.q(
    "SELECT `key`, label, trigger_type, action, enabled, config FROM crm_automation_rules ORDER BY `key` ASC"
  );
  return rows.map(toRule);
}

/**
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").AutomationRule[]>} solo las activas
 */
async function listEnabledRules(tx) {
  const db = tx || { q, one, run };
  const rows = await db.q(
    "SELECT `key`, label, trigger_type, action, enabled, config FROM crm_automation_rules WHERE enabled = TRUE ORDER BY `key` ASC"
  );
  return rows.map(toRule);
}

/**
 * @param {string} key
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").AutomationRule|null>}
 */
async function getRule(key, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(
    "SELECT `key`, label, trigger_type, action, enabled, config FROM crm_automation_rules WHERE `key` = ?",
    [key]
  );
  return row ? toRule(row) : null;
}

/**
 * UPSERT por `key`.
 * @param {import("../../types").AutomationRule} rule
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").AutomationRule>}
 */
async function upsertRule(rule, tx) {
  const db = tx || { q, one, run };
  await db.run(
    `INSERT INTO crm_automation_rules (\`key\`, label, trigger_type, action, enabled, config)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       trigger_type = VALUES(trigger_type),
       action = VALUES(action),
       enabled = VALUES(enabled),
       config = VALUES(config)`,
    [rule.key, rule.label, rule.trigger, rule.action, rule.enabled, stringifyJson(rule.config)]
  );
  return rule;
}

module.exports = { toRule, listRules, listEnabledRules, getRule, upsertRule };
