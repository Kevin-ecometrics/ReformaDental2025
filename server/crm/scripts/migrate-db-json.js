// Migra los datos del CRM viejo (lowdb, src/data/db.json) a MySQL.
//
// Es el unico script que necesita leer el repo del CRM Next.js, y se ejecuta UNA
// vez, en local o en el servidor, cuando la tabla crm_* ya existe (schema.sql
// aplicado y crm/seed.js corrido).
//
//   node crm/scripts/migrate-db-json.js "C:\ruta\a\CRM\src\data\db.json"
//
// Por defecto busca el archivo en la ruta que se le pase; si no se le pasa nada,
// mira en una ruta por defecto que solo funcionara si el CRM esta clonado en el
// mismo arbol de carpetas.
//
// Que migra y que no:
//
//   - leads, activities, tasks: SI, con sus ids originales, para no perder el
//     historial ni las referencias entre ellos.
//   - stages, automationRules, templates: NO. Van en crm/seed.js, que esta
//     versionado en el codigo. Migrarlos ademas crearia reglas duplicadas con
//     ids viejos que el frontend nuevo ya no usa.
//   - syncState: NO. Son marcas de tiempo de una instancia anterior; copiarlas
//     haria que Settings dijera "sincronizado hace 3 meses" con un token que
//     quiza ya no existe. El primer tick deja el estado real.
//   - usuarios: NO existen todavia, se crean con create-crm-user.js.
//
// Es idempotente por id: si se corta a mitad y se vuelve a correr, lo ya
// migrado no se duplica.

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { q, databaseName, useStandalonePool } = require("../db/connection");
const { fromIso } = require("../db/connection");

const DEFAULT_PATH = path.join("C:", "Users", "kevin", "e-commetrics", "CRM", "src", "data", "db.json");

/**
 * @param {string} value
 * @returns {string|null}
 */
function isoToMysql(value) {
  if (!value) return null;
  return fromIso(value);
}

/**
 * @returns {{leads: number, activities: number, tasks: number}}
 */
async function migrate(data) {
  let leads = 0;
  let activities = 0;
  let tasks = 0;

  for (const lead of data.leads || []) {
    const exists = await q("SELECT id FROM crm_leads WHERE id = ?", [lead.id]);
    if (exists.length > 0) continue;

    await q(
      `INSERT INTO crm_leads
         (id, fb_leadgen_id, name, email, phone, source, campaign_name, ad_name, form_name,
          field_data_raw, stage, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        lead.id,
        lead.fbLeadgenId ?? null,
        lead.name,
        lead.email ?? null,
        lead.phone ?? null,
        lead.source,
        lead.campaignName ?? null,
        lead.adName ?? null,
        lead.formName ?? null,
        lead.fieldDataRaw ? JSON.stringify(lead.fieldDataRaw) : null,
        lead.stage,
        lead.notes ?? "",
        isoToMysql(lead.createdAt),
        isoToMysql(lead.updatedAt),
      ]
    );
    leads += 1;
  }

  for (const activity of data.activities || []) {
    const exists = await q("SELECT id FROM crm_activities WHERE id = ?", [activity.id]);
    if (exists.length > 0) continue;

    await q(
      "INSERT INTO crm_activities (id, lead_id, type, content, created_at) VALUES (?,?,?,?,?)",
      [activity.id, activity.leadId, activity.type, activity.content ?? "", isoToMysql(activity.createdAt)]
    );
    activities += 1;
  }

  for (const task of data.tasks || []) {
    const exists = await q("SELECT id FROM crm_tasks WHERE id = ?", [task.id]);
    if (exists.length > 0) continue;

    await q(
      "INSERT INTO crm_tasks (id, lead_id, description, due_at, done, created_at) VALUES (?,?,?,?,?,?)",
      [
        task.id,
        task.leadId,
        task.description,
        isoToMysql(task.dueAt),
        task.done ? 1 : 0,
        isoToMysql(task.createdAt),
      ]
    );
    tasks += 1;
  }

  return { leads, activities, tasks };
}

async function main() {
  const file = process.argv[2] || DEFAULT_PATH;

  if (!fs.existsSync(file)) {
    console.error(`No existe el archivo: ${file}`);
    console.error("Uso: node crm/scripts/migrate-db-json.js <ruta/a/db.json>");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const pool = useStandalonePool();

  try {
    await q("SELECT 1");
    console.log(`Origen:  ${file}`);
    console.log(`Destino: ${databaseName()}`);

    // Las etapas tienen que existir ya, porque los leads apuntan a ellas por id.
    const stages = await q("SELECT COUNT(*) AS n FROM crm_stages");
    if (Number(stages[0].n) === 0) {
      throw new Error("crm_stages esta vacia. Corre primero: node crm/seed.js");
    }

    const counts = await migrate(data);
    console.log(`Migrado: ${counts.leads} leads, ${counts.activities} actividades, ${counts.tasks} tareas`);
    console.log("Las etapas, reglas y plantillas las crea crm/seed.js, no este script.");
    pool.end(() => process.exit(0));
  } catch (err) {
    console.error("Fallo:", err.message);
    pool.end(() => process.exit(1));
  }
}

main();
