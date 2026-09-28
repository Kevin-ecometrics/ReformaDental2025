// Tipos del CRM, en JSDoc. Espeja src/lib/types.ts del repo CRM para que la
// traduccion sea 1:1 y se pueda comparar contra el original.
//
// No hay TypeScript: este modulo se sirve directo en cPanel sin paso de build,
// asi que los tipos son documentacion y chequeo en el editor, no algo que el
// runtime verifique.

/**
 * @typedef {"facebook" | "manual" | "csv"} LeadSource
 * @typedef {"new_lead" | "stage_change" | "stale_contacted"} RuleTrigger
 * @typedef {"create_task" | "send_message"} RuleAction
 * @typedef {"email" | "sms" | "whatsapp"} MessageChannel
 * @typedef {"note" | "stage_change" | "system" | "message_sent" | "message_failed" | "capi_sent" | "capi_failed"} ActivityType
 */

/**
 * @typedef {object} Lead
 * @property {string} id
 * @property {string|null} fbLeadgenId
 * @property {string} name
 * @property {string|null} email
 * @property {string|null} phone
 * @property {LeadSource} source
 * @property {string|null} campaignName
 * @property {string|null} adName
 * @property {string|null} formName
 * @property {Record<string, unknown>|null} fieldDataRaw
 * @property {string} stage
 * @property {string} notes
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} Stage
 * @property {string} id
 * @property {string} name
 * @property {number} order
 * @property {string} color
 */

/**
 * @typedef {object} Activity
 * @property {string} id
 * @property {string} leadId
 * @property {ActivityType} type
 * @property {string} content
 * @property {string} createdAt
 */

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} leadId
 * @property {string} description
 * @property {string} dueAt
 * @property {boolean} done
 * @property {string} createdAt
 */

/**
 * @typedef {object} AutomationRule
 * @property {string} key
 * @property {string} label
 * @property {RuleTrigger} trigger
 * @property {RuleAction} action
 * @property {boolean} enabled
 * @property {object} config
 * @property {string} [config.stage]
 * @property {number} [config.delayHours]
 * @property {number} [config.staleHours]
 * @property {MessageChannel} [config.channel]
 * @property {string} [config.templateKey]
 * @property {string} [config.taskDescription]
 */

/**
 * @typedef {object} MessageTemplate
 * @property {string} key
 * @property {MessageChannel} channel
 * @property {string} label
 * @property {string} [subject]
 * @property {string} body
 * @property {string} [whatsappTemplateName]
 * @property {string} [whatsappTemplateLanguage]
 */

/**
 * @typedef {object} SyncState
 * @property {string|null} lastSyncAt
 * @property {string|null} lastError
 * @property {string|null} lastCapiAt
 * @property {string|null} lastCapiError
 * @property {boolean|null} tokenValid
 * @property {string|null} tokenCheckedAt
 * @property {string|null} tokenCheckError
 */

/**
 * @typedef {object} CrmUser
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} passwordHash
 * @property {string} role
 * @property {string} createdAt
 * @property {string|null} lastLoginAt
 */

/**
 * @typedef {object} CreateLeadInput
 * @property {string} name
 * @property {string|null} [email]
 * @property {string|null} [phone]
 * @property {LeadSource} source
 * @property {string|null} [fbLeadgenId]
 * @property {string|null} [campaignName]
 * @property {string|null} [adName]
 * @property {string|null} [formName]
 * @property {Record<string, unknown>|null} [fieldDataRaw]
 * @property {string} [notes]
 */

module.exports = {};
