// Envoltura de promesas sobre el pool `mysql` (driver v2) que crea server.js.
//
// El driver `mysql` v2 es callback-only. Casi todo el modulo esta escrito en
// async/await, asi que aqui se envuelve en tres helpers y se centraliza el
// mapeo de filas: MySQL devuelve snake_case, el resto del modulo trabaja con
// camelCase igual que la version Next.js del CRM.
//
// El pool NO se crea aqui. Se recibe desde server.js para no duplicar
// conexiones ni credenciales: mount({ db, mail }) lo pasa por parametro.
//
// OJO: esto comparte la base con el calendario. Nada de DDL ni TRUNCATE en
// tiempo de ejecucion -- el unico punto donde se crea schema es aplicando
// crm/db/schema.sql a mano, una vez.

/** @typedef {import('mysql').Pool} Pool */

let pool = null;

/**
 * Registra el pool. Lo llama crm/index.js al montar el router.
 * @param {Pool} db
 */
function setPool(db) {
  pool = db;
}

/** @returns {Pool} */
function getPool() {
  if (!pool) throw new Error("crm: pool de MySQL no registrado (falta mount())");
  return pool;
}

/**
 * Crea un pool propio para los scripts de linea de comandos (crm/seed.js,
 * crm/scripts/*), que corren sin server.js y por tanto sin pool inyectado.
 *
 * Replica exactamente la configuracion de server.js para que el script
 * escriba en la misma base con los mismos parametros. Los scripts cierran el
 * pool al terminar; el servidor no usa esto nunca.
 *
 * @returns {Pool}
 */
function createStandalonePool() {
  const mysql = require("mysql");
  return mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: databaseName(),
    port: 3306,
    connectionLimit: 2,
  });
}

/**
 * Registra un pool standalone. Para scripts CLI unicamente.
 * @returns {Pool} el pool creado, para poder cerrarlo al salir
 */
function useStandalonePool() {
  const created = createStandalonePool();
  setPool(created);
  return created;
}

/**
 * Base de datos efectiva. El calendario usa MYSQL_DATABASE con default
 * clinicareforma_contacts; el CRM comparte esa misma base.
 * @returns {string}
 */
function databaseName() {
  return process.env.MYSQL_DATABASE || "clinicareforma_contacts";
}

/**
 * Query que devuelve filas mapeadas a camelCase.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<object[]>}
 */
function q(sql, params) {
  return new Promise((resolve, reject) => {
    getPool().query(sql, params || [], (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map(mapRow));
    });
  });
}

/**
 * Query que devuelve la primera fila, o null.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<object|null>}
 */
async function one(sql, params) {
  const rows = await q(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * INSERT / UPDATE / DELETE. Devuelve insertId y affectedRows, sin mapear.
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<{insertId: number, affectedRows: number}>}
 */
function run(sql, params) {
  return new Promise((resolve, reject) => {
    getPool().query(sql, params || [], (err, result) => {
      if (err) return reject(err);
      resolve({
        insertId: result.insertId,
        affectedRows: result.affectedRows,
      });
    });
  });
}

/**
 * Ejecuta fn dentro de una transaccion. Hace commit si resuelve y rollback si
 * lanza. Necesario porque la version lowdb escribia de a una, y MySQL no: un
 * cambio de etapa y su actividad tienen que ser atomicos o el log queda
 * mostrando un cambio que no ocurrio.
 *
 * @template T
 * @param {(tx: { q: typeof q, one: typeof one, run: typeof run }) => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withTransaction(fn) {
  return new Promise((resolve, reject) => {
    getPool().getConnection((err, conn) => {
      if (err) return reject(err);

      const tx = {
        q: (sql, params) =>
          new Promise((res, rej) => {
            conn.query(sql, params || [], (e, rows) => (e ? rej(e) : res((rows || []).map(mapRow))));
          }),
        one: async (sql, params) => {
          const rows = await tx.q(sql, params);
          return rows.length ? rows[0] : null;
        },
        run: (sql, params) =>
          new Promise((res, rej) => {
            conn.query(sql, params || [], (e, result) =>
              e ? rej(e) : res({ insertId: result.insertId, affectedRows: result.affectedRows })
            );
          }),
      };

      conn.beginTransaction((beginErr) => {
        if (beginErr) {
          conn.release();
          return reject(beginErr);
        }

        Promise.resolve()
          .then(() => fn(tx))
          .then(
            (value) => {
              conn.commit((commitErr) => {
                conn.release();
                commitErr ? reject(commitErr) : resolve(value);
              });
            },
            (fnErr) => {
              conn.rollback(() => {
                conn.release();
                reject(fnErr);
              });
            }
          );
      });
    });
  });
}

/**
 * snake_case -> camelCase para los campos que el codigo usa.
 * Las columnas `key` y `order` son palabras reservadas en varios contextos y
 * se acceden por sus alias en las queries, asi que no hace falta mapearlas.
 */
const COLUMN_MAP = {
  fb_leadgen_id: "fbLeadgenId",
  campaign_name: "campaignName",
  ad_name: "adName",
  form_name: "formName",
  field_data_raw: "fieldDataRaw",
  created_at: "createdAt",
  updated_at: "updatedAt",
  lead_id: "leadId",
  due_at: "dueAt",
  trigger_type: "trigger",
  last_sync_at: "lastSyncAt",
  last_error: "lastError",
  last_capi_at: "lastCapiAt",
  last_capi_error: "lastCapiError",
  token_valid: "tokenValid",
  token_checked_at: "tokenCheckedAt",
  token_check_error: "tokenCheckError",
  password_hash: "passwordHash",
  last_login_at: "lastLoginAt",
  whatsapp_template_name: "whatsappTemplateName",
  whatsapp_template_language: "whatsappTemplateLanguage",
};

/**
 * Convierte una fila de MySQL a la forma que espera el resto del modulo.
 * @param {object} row
 * @returns {object}
 */
function mapRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [col, value] of Object.entries(row)) {
    out[COLUMN_MAP[col] || col] = value;
  }
  return out;
}

/**
 * DATETIME(3) -> ISO string, para no cambiar el contrato con el frontend.
 * MySQL devuelve 'YYYY-MM-DD HH:MM:SS.mmm' en hora local del servidor; se
 * convierte a ISO treating it as local time, que es como el CRM lo venia
 * haciendo con los new Date() de la version lowdb.
 * @param {Date|string|null} value
 * @returns {string|null}
 */
function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return (
      value.getFullYear() +
      "-" +
      String(value.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(value.getDate()).padStart(2, "0") +
      "T" +
      String(value.getHours()).padStart(2, "0") +
      ":" +
      String(value.getMinutes()).padStart(2, "0") +
      ":" +
      String(value.getSeconds()).padStart(2, "0") +
      "." +
      String(value.getMilliseconds()).padStart(3, "0") +
      "Z"
    );
  }
  return String(value).replace(" ", "T") + "Z";
}

/**
 * ISO string -> valor para un DATETIME(3). Se manda el string crudo a MySQL
 * quitando la 'Z' porque MySQL lo interpretaria como UTC cuando el valor
 * generado fue local.
 * @param {string} iso
 * @returns {string}
 */
function fromIso(iso) {
  return String(iso).replace("T", " ").replace("Z", "");
}

/**
 * JSON column -> objeto. El driver `mysql` v2 parsea columnas JSON por
 * defecto, pero eso depende de la version y de config.jsonStrings, asi que
 * se acepta cualquiera de las dos formas para no romper si el server tiene
 * una version distinta a la que se probo.
 * @param {unknown} value
 * @returns {Record<string, unknown>|null}
 */
function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * objeto -> string para una columna JSON.
 * @param {unknown} value
 * @returns {string|null}
 */
function stringifyJson(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Fecha actual en el formato que espera un DATETIME(3).
 * @returns {string}
 */
function now() {
  return fromIso(new Date().toISOString());
}

module.exports = {
  setPool,
  getPool,
  createStandalonePool,
  useStandalonePool,
  databaseName,
  q,
  one,
  run,
  withTransaction,
  mapRow,
  toIso,
  fromIso,
  parseJson,
  stringifyJson,
  now,
};
