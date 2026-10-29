// Genera el INSERT del primer usuario del CRM para pegarlo en phpMyAdmin.
// Equivale a `--crm-create-user`, pero sin tocar la base ni pedir terminal en el
// servidor. Se corre en TU maquina; la contrasena no sale de ella.
//
//   node crm-user-sql.js tu@correo.com "Tu Nombre" "contrasena-de-12-o-mas"
//
// Usa los mismos parametros scrypt y el mismo formato que crm/auth.js
// (scrypt$N$r$p$saltHex$hashHex), asi que el login lo acepta tal cual.

const crypto = require("crypto");

const [emailArg, nameArg, password] = process.argv.slice(2);

if (!emailArg || !password) {
  console.error('Uso: node crm-user-sql.js <email> "<nombre>" "<contrasena>"');
  process.exit(1);
}
if (password.length < 12) {
  console.error("La contrasena debe tener al menos 12 caracteres.");
  process.exit(1);
}

const email = String(emailArg).trim().toLowerCase();
const name = nameArg || email.split("@")[0];

const N = 16384, r = 8, p = 1, KEYLEN = 64;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r, p });
const passwordHash = ["scrypt", N, r, p, salt.toString("hex"), hash.toString("hex")].join("$");

// Escapa para un literal SQL: la barra invertida y la comilla simple se duplican.
const q = (s) => "'" + String(s).split("\\").join("\\\\").split("'").join("''") + "'";

console.log(
  "INSERT INTO crm_users (id, email, name, password_hash, role, created_at, last_login_at) VALUES (" +
    [q(crypto.randomUUID()), q(email), q(name), q(passwordHash), q("admin"), "UTC_TIMESTAMP(3)", "NULL"].join(", ") +
    ");"
);
