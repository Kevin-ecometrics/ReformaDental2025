// Acceso a crm_users: la auth del CRM.
//
// El calendario no tiene usuarios ni auth (sus 14 rutas son publicas); esto es
// propio del CRM, que si expone PII de leads y puede gastar presupuesto de
// Twilio y Meta si alguien lo llama anonimo.

const crypto = require("node:crypto");
const { q, one, run, now, toIso } = require("../../db/connection");

/**
 * @param {object} row
 * @returns {import("../../types").CrmUser}
 */
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role,
    createdAt: toIso(row.createdAt),
    lastLoginAt: toIso(row.lastLoginAt),
  };
}

/** @typedef {import("./leads").Tx} Tx */

/**
 * Busca por email. El email se normaliza a minusculas porque es la unica
 * credencial que el usuario escribe a mano.
 * @param {string} email
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").CrmUser|null>}
 */
async function getUserByEmail(email, tx) {
  const db = tx || { q, one, run };
  const row = await db.one(
    "SELECT id, email, name, password_hash, role, created_at, last_login_at FROM crm_users WHERE email = ?",
    [String(email || "").trim().toLowerCase()]
  );
  return row ? toUser(row) : null;
}

/**
 * @param {string} id
 * @returns {Promise<import("../../types").CrmUser|null>}
 */
async function getUserById(id) {
  const row = await one(
    "SELECT id, email, name, password_hash, role, created_at, last_login_at FROM crm_users WHERE id = ?",
    [id]
  );
  return row ? toUser(row) : null;
}

/**
 * Cambia solo los campos indicados.
 * @param {string} id
 * @param {{name?: string, role?: string, passwordHash?: string}} patch
 * @returns {Promise<void>}
 */
async function updateUser(id, patch) {
  const columns = { name: "name", role: "role", passwordHash: "password_hash" };
  const fields = Object.keys(patch).filter((field) => columns[field]);
  if (fields.length === 0) return;
  await run(
    `UPDATE crm_users SET ${fields.map((field) => `${columns[field]} = ?`).join(", ")} WHERE id = ?`,
    [...fields.map((field) => patch[field]), id]
  );
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteUser(id) {
  await run("DELETE FROM crm_users WHERE id = ?", [id]);
}

/**
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").CrmUser[]>}
 */
async function listUsers(tx) {
  const db = tx || { q, one, run };
  const rows = await db.q(
    "SELECT id, email, name, password_hash, role, created_at, last_login_at FROM crm_users ORDER BY created_at ASC"
  );
  return rows.map(toUser);
}

/**
 * @param {import("../../types").CrmUser} user
 * @param {Tx} [tx]
 * @returns {Promise<import("../../types").CrmUser>}
 */
async function createUser(user, tx) {
  const db = tx || { q, one, run };
  const record = { id: crypto.randomUUID(), createdAt: now(), lastLoginAt: null, role: "admin", ...user };

  await db.run(
    "INSERT INTO crm_users (id, email, name, password_hash, role, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)",
    [
      record.id,
      String(record.email).trim().toLowerCase(),
      record.name,
      record.passwordHash,
      record.role,
      record.createdAt,
      record.lastLoginAt,
    ]
  );

  return record;
}

/**
 * Registra el ultimo login exitoso. No es critico si falla: un login valido no
 * debe convertirse en 500 por un UPDATE de bookkeeping.
 * @param {string} id
 * @param {Tx} [tx]
 * @returns {Promise<void>}
 */
async function touchLastLogin(id, tx) {
  const db = tx || { q, one, run };
  try {
    await db.run("UPDATE crm_users SET last_login_at = ? WHERE id = ?", [now(), id]);
  } catch (err) {
    console.warn("[crm] no se pudo registrar last_login_at:", err.message);
  }
}

module.exports = { toUser, getUserByEmail, getUserById, listUsers, createUser, updateUser, deleteUser, touchLastLogin };
