// GET /health -- responde "el server.js que acabo de subir esta bien armado?".
//
// Es publico (lo tiene que poder llamar curl sin credenciales justo despues del
// deploy), asi que devuelve SOLO booleanos, conteos y nombres de tablas. Nunca
// valores de variables, correos, ni filas de leads.
//
// Codigo HTTP:
//   200  todo lo imprescindible esta bien (puede traer `warnings`)
//   503  algo imprescindible falla: base caida, faltan tablas, sin JWT, sin seed
//        o sin usuarios. Permite `curl -f` y monitores externos.
//
// Imprescindible = sin ello el calendario o el login del CRM no funcionan.
// Advertencia    = integracion opcional (Facebook, WhatsApp, SMS) sin configurar.

const { isStarted } = require("./scheduler");
const { getLastTick } = require("./services/tick");

const CRM_TABLES = [
  "crm_stages",
  "crm_leads",
  "crm_activities",
  "crm_tasks",
  "crm_automation_rules",
  "crm_templates",
  "crm_sync_state",
  "crm_users",
];

const QUERY_TIMEOUT_MS = 5000;

// Sin ningun tick en este tiempo, con la ruta del cron configurada, algo falla:
// o el Cron Jobs de cPanel no esta llamando, o el sync se cuelga.
const TICK_STALE_MS = 15 * 60 * 1000;
const startedAt = new Date();

/**
 * Query con tope de tiempo: un pool contra una base colgada no debe dejar el
 * health colgado tambien.
 * @param {import('mysql').Pool} db
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<any[]>}
 */
function query(db, sql, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout de " + QUERY_TIMEOUT_MS + " ms")),
      QUERY_TIMEOUT_MS
    );
    db.query(sql, params || [], (err, rows) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/** @returns {boolean} true si CRM_JWT_SECRET existe y tiene 32+ caracteres */
function jwtOk() {
  const secret = process.env.CRM_JWT_SECRET;
  return Boolean(secret && secret.length >= 32);
}

/**
 * @param {{ db: import('mysql').Pool, calendarTables: string[] }} deps
 * @returns {Promise<{ code: number, body: object }>}
 */
async function checkHealth(deps) {
  const { db, calendarTables } = deps;
  const failures = [];
  const warnings = [];

  const body = {
    status: "ok",
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: startedAt.toISOString(),
    node: process.version,
    database: { ok: false },
    calendar: { ok: false, missingTables: [] },
    crm: {
      mounted: true,
      tables: { ok: false, missing: [] },
      jwtSecret: jwtOk(),
      scheduler: isStarted(),
      cronEndpoint: false,
      lastTick: null,
      seeded: null,
      users: null,
      integrations: {},
    },
  };

  // 1) Base de datos
  try {
    const rows = await query(db, "SELECT DATABASE() AS name, VERSION() AS version");
    body.database = { ok: true, name: rows[0] && rows[0].name, version: rows[0] && rows[0].version };
  } catch (err) {
    body.database = { ok: false, error: err.message };
    failures.push("database: " + err.message);
  }

  // 2) Tablas del calendario y del CRM (solo si hay base)
  if (body.database.ok) {
    try {
      const wanted = calendarTables.concat(CRM_TABLES);
      const rows = await query(
        db,
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)",
        [wanted]
      );
      const present = new Set(rows.map((r) => String(r.name).toLowerCase()));
      const missingCal = calendarTables.filter((t) => !present.has(t));
      const missingCrm = CRM_TABLES.filter((t) => !present.has(t));

      body.calendar = { ok: missingCal.length === 0, missingTables: missingCal };
      body.crm.tables = { ok: missingCrm.length === 0, missing: missingCrm };
      if (missingCal.length) failures.push("faltan tablas del calendario: " + missingCal.join(", "));
      if (missingCrm.length) failures.push("faltan tablas del CRM (aplicar schema.sql): " + missingCrm.join(", "));

      // 3) Datos base del CRM (solo si sus tablas existen)
      if (missingCrm.length === 0) {
        const counts = await query(
          db,
          "SELECT " +
            "(SELECT COUNT(*) FROM crm_stages) AS stages, " +
            "(SELECT COUNT(*) FROM crm_automation_rules) AS rules, " +
            "(SELECT COUNT(*) FROM crm_templates) AS templates, " +
            "(SELECT COUNT(*) FROM crm_sync_state) AS syncState, " +
            "(SELECT COUNT(*) FROM crm_users) AS users"
        );
        const c = counts[0];
        body.crm.seeded = {
          ok:
            Number(c.stages) > 0 &&
            Number(c.rules) > 0 &&
            Number(c.templates) > 0 &&
            Number(c.syncState) > 0,
          stages: Number(c.stages),
          rules: Number(c.rules),
          templates: Number(c.templates),
          syncState: Number(c.syncState),
        };
        body.crm.users = Number(c.users);
        if (!body.crm.seeded.ok) failures.push("CRM sin sembrar: correr node server.js --crm-seed");
        if (body.crm.users === 0) failures.push("CRM sin usuarios: correr node server.js --crm-create-user");
      }
    } catch (err) {
      failures.push("tablas: " + err.message);
    }
  }

  // 4) Configuracion (sin valores, solo si existe)
  if (!body.crm.jwtSecret) failures.push("CRM_JWT_SECRET falta o tiene menos de 32 caracteres");
  if (!body.crm.scheduler) warnings.push("el cron del CRM no esta arrancado");

  // Ruta del cron por HTTP (POST /crm/cron/tick): solo si esta encendida y cuando
  // fue el ultimo tick. Nunca el valor del token.
  const cronToken = process.env.CRM_CRON_TOKEN;
  body.crm.cronEndpoint = Boolean(cronToken && cronToken.length >= 32);
  body.crm.lastTick = getLastTick();
  if (body.crm.cronEndpoint && body.uptimeSeconds * 1000 > TICK_STALE_MS) {
    const last = body.crm.lastTick;
    if (!last || Date.now() - Date.parse(last.finishedAt) > TICK_STALE_MS) {
      warnings.push("sin ticks del CRM en los ultimos 15 minutos: revisar el Cron Jobs de cPanel");
    }
  }

  const env = process.env;
  body.crm.integrations = {
    facebookLeadSync: Boolean(env.CRM_FB_PAGE_ACCESS_TOKEN && env.CRM_FB_PAGE_ID),
    facebookCapi: Boolean(env.CRM_FB_CAPI_ACCESS_TOKEN),
    facebookCapiTestMode: Boolean(env.CRM_FB_CAPI_TEST_EVENT_CODE),
    email: Boolean((env.CRM_SMTP_HOST || env.EMAIL_HOST) && (env.CRM_SMTP_FROM || env.EMAIL_USER)),
    whatsapp: Boolean(env.CRM_WHATSAPP_ACCESS_TOKEN && env.CRM_WHATSAPP_PHONE_NUMBER_ID),
    sms: Boolean(env.CRM_TWILIO_ACCOUNT_SID && env.CRM_TWILIO_AUTH_TOKEN && env.CRM_TWILIO_FROM_SMS_NUMBER),
  };
  if (!body.crm.integrations.facebookLeadSync) {
    warnings.push("Facebook Lead Ads sin configurar: no se traeran leads");
  }
  if (body.crm.integrations.facebookCapiTestMode) {
    warnings.push(
      "CRM_FB_CAPI_TEST_EVENT_CODE tiene valor: Meta NO cuenta los eventos CAPI (dejar vacia en produccion)"
    );
  }
  if (!body.crm.integrations.email) warnings.push("email sin configurar");

  if (failures.length) body.failures = failures;
  if (warnings.length) body.warnings = warnings;
  body.status = failures.length ? "fail" : "ok";

  return { code: failures.length ? 503 : 200, body };
}

module.exports = { checkHealth, CRM_TABLES };
