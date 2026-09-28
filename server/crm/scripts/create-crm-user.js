// Crea el primer usuario del CRM.
//
// No hay registro ni invitaciones: el acceso es por credenciales escritas en la
// base por alguien con acceso al servidor. Es lo unico razonable mientras el
// CRM lo use una persona del equipo, no clientes.
//
// Uso, desde la terminal de cPanel:
//
//     node crm/scripts/create-crm-user.js ana@reformadental.com "Ana Lopez" "contrasena-larga"
//
// Si se omite el tercer argumento, la contrasena se pide por la terminal sin
// eco, que es la forma menos mala: la que se pasa como argumento queda en el
// historial del shell.

require("dotenv").config();

const readline = require("node:readline");
const { q, databaseName, useStandalonePool } = require("../db/connection");
const { getUserByEmail, createUser } = require("../services/repo/users");
const { hashPassword } = require("../auth");

const CTRL_C = "";
const CTRL_D = "";
const BACKSPACE = "\u007f";

/**
 * Pregunta por la terminal sin eco.
 *
 * A mano y sin dependencias: lo unico que hace falta es poner la stdin en modo
 * raw, ignorar los caracteres que se dibujan y acumular los demas. Si no hay
 * TTY (un pipe, un script) cae a una pregunta normal, porque en ese caso no hay
 * historial ni pantalla compartida que proteger.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
function askHidden(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => readline.question(question, resolve));
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";
    stdin.on("data", (chunk) => {
      const s = chunk.toString();

      if (s === "\r" || s === "\n" || s === CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (s === CTRL_C) {
        stdin.setRawMode(false);
        reject(new Error("cancelado"));
      } else if (s === BACKSPACE) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        value += s;
      }
    });
  });
}

async function main() {
  const [emailArg, nameArg, passwordArg] = process.argv.slice(2);

  if (!emailArg) {
    console.error("Uso: node crm/scripts/create-crm-user.js <email> [nombre] [contrasena]");
    process.exit(1);
  }

  const email = String(emailArg).trim().toLowerCase();
  const name = nameArg || email.split("@")[0];

  let password = passwordArg;
  if (!password) {
    password = await askHidden("Contrasena: ");
  }

  if (password.length < 12) {
    console.error("La contrasena debe tener al menos 12 caracteres.");
    process.exit(1);
  }

  const pool = useStandalonePool();

  try {
    await q("SELECT 1");
    console.log(`Conectado a ${databaseName()}`);

    const existing = await getUserByEmail(email);
    if (existing) {
      console.error(`Ya existe un usuario con el email ${email}. No se crea otro.`);
      pool.end(() => process.exit(1));
      return;
    }

    const user = await createUser({ email, name, passwordHash: hashPassword(password), role: "admin" });
    console.log(`Usuario creado: ${user.email} (${user.id})`);
    pool.end(() => process.exit(0));
  } catch (err) {
    console.error("Fallo:", err.message);
    pool.end(() => process.exit(1));
  }
}

main().catch((err) => {
  console.error("Fallo:", err.message);
  process.exit(1);
});
