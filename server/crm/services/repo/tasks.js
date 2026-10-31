// Acceso a crm_tasks.
//
// La API solo expone GET /crm/tasks y PATCH /crm/tasks/:id, igual que la
// version Next.js: las tareas se crean por reglas de automatizacion, no a
// mano. Que exista un endpoint POST para crearlas a mano esta en el backlog
// como feature pendiente, no implementado aqui.

const crypto = require("node:crypto");
const { q, one, run, now, fromIso, toIso } = require("../../db/connection");
const { touchLead } = require("./leads");

/**
 * @param {object} row
 * @returns {import("../../types").Task}
 */
function toTask(row) {
  return {
    id: row.id,
    leadId: row.leadId,
    description: row.description,
    dueAt: toIso(row.dueAt),
    // mysql devuelve TINYINT(1) como 0/1, no como booleano
    done: row.done === 1 || row.done === true,
    createdAt: toIso(row.createdAt),
  };
}

/** @typedef {import("./leads").Tx} Tx */

/**
 * Con `leadId`, todas las tareas de ese lead. Sin el, la lista general, que
 * omite las de leads archivados (panel de tareas y dashboard).
 * @param {string} [leadId]
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Task[]>}
 */
async function listTasks(leadId, tx) {
  const db = tx || { q, one, run };
  const rows = leadId
    ? await db.q(
        "SELECT id, lead_id, description, due_at, done, created_at FROM crm_tasks WHERE lead_id = ? ORDER BY due_at ASC",
        [leadId]
      )
    : await db.q(
        `SELECT t.id, t.lead_id, t.description, t.due_at, t.done, t.created_at FROM crm_tasks t
         JOIN crm_leads l ON l.id = t.lead_id WHERE l.archived_at IS NULL ORDER BY t.due_at ASC`
      );
  return rows.map(toTask);
}

/**
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Task|null>}
 */
async function getTask(id, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(
    "SELECT id, lead_id, description, due_at, done, created_at FROM crm_tasks WHERE id = ?",
    [id]
  );
  return row ? toTask(row) : null;
}

/**
 * @param {string} leadId
 * @param {string} description
 * @param {string} dueAtIso
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Task>}
 */
async function createTask(leadId, description, dueAtIso, tx) {
  const db = tx || { q, one, run };
  const id = crypto.randomUUID();
  const createdAt = now();

  await db.run(
    "INSERT INTO crm_tasks (id, lead_id, description, due_at, done, created_at) VALUES (?,?,?,?,FALSE,?)",
    [id, leadId, description, fromIso(dueAtIso), createdAt]
  );

  return { id, leadId, description, dueAt: toIso(fromIso(dueAtIso)), done: false, createdAt: toIso(createdAt) };
}

/**
 * Marca la tarea como hecha. Idempotente: volver a completarla no falla.
 * @param {string} taskId
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").Task|null>}
 */
async function completeTask(taskId, tx) {
  const db = tx || { q, one, run };
  const task = await getTask(taskId, db);
  if (!task) return null;

  // Completar una tarea es trabajar el lead: cuenta como actividad para la regla
  // "sin actividad" (si no, "Follow up again" se recrea en el siguiente tick). Va
  // antes del UPDATE y solo la primera vez, para que repetir la llamada no cuente.
  if (!task.done) await touchLead(task.leadId, db);

  await db.run("UPDATE crm_tasks SET done = TRUE WHERE id = ?", [taskId]);
  return { ...task, done: true };
}

/**
 * @param {string} taskId
 * @param {{description: string, dueAtIso: string}} changes
 * @returns {Promise<import("../../types").Task|null>}
 */
async function updateTask(taskId, changes) {
  await run("UPDATE crm_tasks SET description = ?, due_at = ? WHERE id = ?", [
    changes.description,
    fromIso(changes.dueAtIso),
    taskId,
  ]);
  return getTask(taskId);
}

/**
 * @param {string} taskId
 * @returns {Promise<void>}
 */
async function deleteTask(taskId) {
  await run("DELETE FROM crm_tasks WHERE id = ?", [taskId]);
}

module.exports = { toTask, listTasks, getTask, createTask, completeTask, updateTask, deleteTask };
