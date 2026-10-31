// Acceso a crm_sync_state: una sola fila (id=1) con el estado del sync de
// Facebook, del CAPI y del Page token. Es la unica tabla sin lista ni detalle:
// se lee entera y se actualiza campo por campo.

const { q, one, run, toIso } = require("../../db/connection");

/** @typedef {import("./leads").Tx} Tx */

/**
 * @returns {Promise<import("../../types").SyncState>}
 */
async function getSyncState(tx) {
  const db = tx || { q, one, run };
  const row = await db.one(
    "SELECT last_sync_at, last_error, last_capi_at, last_capi_error, token_valid, token_checked_at, token_check_error, notify_emails FROM crm_sync_state WHERE id = 1"
  );

  if (!row) {
    // La fila la inserta schema.sql. Si no esta, la base se aplico a medias:
    // devolver el estado vacio es mejor que romper GET /crm/settings.
    return {
      lastSyncAt: null,
      lastError: null,
      lastCapiAt: null,
      lastCapiError: null,
      tokenValid: null,
      tokenCheckedAt: null,
      tokenCheckError: null,
      notifyEmails: null,
    };
  }

  return {
    lastSyncAt: toIso(row.lastSyncAt),
    lastError: row.lastError ?? null,
    lastCapiAt: toIso(row.lastCapiAt),
    lastCapiError: row.lastCapiError ?? null,
    tokenValid: row.tokenValid === null ? null : row.tokenValid === 1 || row.tokenValid === true,
    tokenCheckedAt: toIso(row.tokenCheckedAt),
    tokenCheckError: row.tokenCheckError ?? null,
    notifyEmails: row.notifyEmails ?? null,
  };
}

/**
 * Actualiza solo los campos indicados.
 * @param {Partial<Record<keyof import("../../types").SyncState, unknown>>} patch
 * @param {Tx} [tx]
 * @returns {Promise<void>}
 */
async function updateSyncState(patch, tx) {
  const db = tx || { q, one, run };
  const COLUMNS = {
    lastSyncAt: "last_sync_at",
    lastError: "last_error",
    lastCapiAt: "last_capi_at",
    lastCapiError: "last_capi_error",
    tokenValid: "token_valid",
    tokenCheckedAt: "token_checked_at",
    tokenCheckError: "token_check_error",
    notifyEmails: "notify_emails",
  };

  const sets = [];
  const params = [];
  for (const [field, value] of Object.entries(patch)) {
    const column = COLUMNS[field];
    if (!column) continue;
    sets.push(`${column} = ?`);
    params.push(value === undefined ? null : value);
  }
  if (sets.length === 0) return;

  params.push(1); // WHERE id = 1
  await db.run(`UPDATE crm_sync_state SET ${sets.join(", ")} WHERE id = ?`, params);
}

// El cursor de citas va aparte de getSyncState a proposito: si falta la columna,
// falla solo este paso del tick y no Settings ni el aviso de lead nuevo.

/** @returns {Promise<number|null>} */
async function getLastCitaId() {
  const row = await one("SELECT last_cita_id FROM crm_sync_state WHERE id = 1");
  return row?.lastCitaId ?? null;
}

/**
 * @param {number} id
 * @returns {Promise<void>}
 */
async function setLastCitaId(id) {
  await run("UPDATE crm_sync_state SET last_cita_id = ? WHERE id = 1", [id]);
}

module.exports = { getSyncState, updateSyncState, getLastCitaId, setLastCitaId };
