// Motor de automatizaciones.
//
// Traduccion directa de src/lib/automation.ts. Las reglas viven ahora en
// crm_automation_rules, pero la semantica se conserva entera: mismas acciones
// (create_task, send_message), mismos triggers (new_lead, stage_change,
// stale_contacted) y las mismas dos protecciones que ya estan a proposito en el
// original -- no repetir una tarea abierta identica, y no disparar una regla
// desactivada.
//
// Ni fireStageChangeSideEffects ni runAutomationTick lanzan excepciones hacia
// arriba: un evento de Meta caido o un SMTP caido no pueden tumbar el endpoint
// que cambio una etapa, ni el tick del cron.

const { listEnabledRules } = require("./repo/rules");
const { listTasks, createTask } = require("./repo/tasks");
const { listLeads } = require("./repo/leads");
const { getStage } = require("./repo/stages");
const { sendCapiEvent } = require("./facebook/capi");
const { sendMessageToLead } = require("./messaging");
const { sendEmail } = require("./messaging/email");
const { getSyncState } = require("./repo/syncState");

/**
 * Aviso al equipo de un lead nuevo de Facebook, para cumplir "Call within 1
 * hour". Los manuales y de CSV no avisan: quien los da de alta ya sabe, y un
 * CSV de 100 filas serian 100 correos. Un fallo solo queda en el log.
 *
 * @param {import("../types").Lead} lead
 * @returns {Promise<void>}
 */
async function notifyNewLead(lead) {
  if (lead.source !== "facebook") return;
  try {
    const { notifyEmails } = await getSyncState();
    if (!notifyEmails) return;

    const lines = [
      `Name: ${lead.name}`,
      `Phone: ${lead.phone || "-"}`,
      `Email: ${lead.email || "-"}`,
      `Campaign: ${lead.campaignName || "-"}`,
      `Form: ${lead.formName || "-"}`,
    ];
    const result = await sendEmail({
      to: notifyEmails,
      subject: `New lead: ${lead.name}`,
      text: `${lines.join("\n")}\n\nCall within 1 hour.`,
    });
    if (!result.ok) console.error(`[crm/automation] aviso de lead ${lead.id} fallo:`, result.error);
  } catch (err) {
    console.error(`[crm/automation] aviso de lead ${lead.id} fallo:`, err instanceof Error ? err.message : err);
  }
}

/**
 * @param {string} stageId
 * @returns {Promise<string>} el id si la etapa no existe, para no perder el
 *   nombre real del evento de CAPI
 */
async function getStageName(stageId) {
  const stage = await getStage(stageId);
  return stage ? stage.name : stageId;
}

/**
 * @param {import("../types").AutomationRule} rule
 * @param {import("../types").Lead} lead
 * @returns {Promise<void>}
 */
async function applyRule(rule, lead) {
  if (!rule.enabled) return;

  if (rule.action === "create_task") {
    const delayHours = rule.config.delayHours ?? 0;
    const dueAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
    const description = rule.config.taskDescription || rule.label;

    // No duplicar tareas abiertas identicas para la misma regla y lead: el tick
    // de "stale_contacted" puede disparar la misma regla muchas veces.
    const existing = await listTasks(lead.id);
    const alreadyOpen = existing.some((t) => !t.done && t.description === description);
    if (alreadyOpen) return;

    await createTask(lead.id, description, dueAt);
  } else if (rule.action === "send_message" && rule.config.channel && rule.config.templateKey) {
    await sendMessageToLead(lead, rule.config.channel, rule.config.templateKey);
  }
}

/**
 * Evalua las reglas que corresponde a un evento: creacion (oldStage === null) o
 * cambio de etapa. Ademas dispara el evento de CAPI de la etapa destino, solo
 * para leads de Facebook: los manuales, de CSV o de una cita del sitio no
 * vinieron de un anuncio y le ensucian a Meta la optimizacion de campanas.
 *
 * @param {import("../types").Lead} lead
 * @param {string|null} oldStage
 * @param {string} newStage
 * @returns {Promise<void>}
 */
async function fireStageChangeSideEffects(lead, oldStage, newStage) {
  if (lead.source === "facebook") {
    await sendCapiEvent(lead, await getStageName(newStage));
  }

  const rules = await listEnabledRules();

  if (oldStage === null) {
    await notifyNewLead(lead);
    for (const rule of rules.filter((r) => r.trigger === "new_lead")) {
      await applyRule(rule, lead);
    }
    return;
  }

  for (const rule of rules.filter((r) => r.trigger === "stage_change")) {
    if (rule.config.stage && rule.config.stage !== newStage) continue;
    await applyRule(rule, lead);
  }
}

/**
 * Tick del cron: reglas basadas en tiempo (hoy solo "stale_contacted"), que no
 * dependen de un evento concreto.
 *
 * @returns {Promise<void>}
 */
async function runAutomationTick() {
  const rules = await listEnabledRules();
  const staleRules = rules.filter((r) => r.trigger === "stale_contacted");
  if (staleRules.length === 0) return;

  const leads = await listLeads();
  const contactedLeads = leads.filter((l) => l.stage === "contacted");

  for (const rule of staleRules) {
    const staleHours = rule.config.staleHours ?? 48;
    const staleMs = staleHours * 60 * 60 * 1000;
    for (const lead of contactedLeads) {
      const lastTouch = new Date(lead.updatedAt).getTime();
      if (Date.now() - lastTouch >= staleMs) {
        await applyRule(rule, lead);
      }
    }
  }
}

module.exports = { applyRule, getStageName, fireStageChangeSideEffects, runAutomationTick };
