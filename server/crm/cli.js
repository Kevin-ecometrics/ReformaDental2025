// Comandos de administracion del CRM, expuestos como flags de server.js.
//
// El CRM se despliega como un unico server.js (ver build.js), asi que las tres
// tareas de instalacion no son scripts sueltos sino flags del mismo archivo:
//
//     node server.js --crm-seed
//     node server.js --crm-create-user <email> [nombre] [contrasena]
//     node server.js --crm-migrate <ruta/a/db.json>
//
// Corren y salen; nunca levantan el servidor ni el cron.

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {boolean} true si era un comando del CRM (ya lanzado, el proceso
 *   termina solo); false si el arranque debe seguir como servidor normal.
 */
function run(argv) {
  const i = argv.findIndex((a) => a.indexOf("--crm-") === 0);
  if (i === -1) return false;

  const flag = argv[i];
  const args = argv.slice(i + 1);
  let job;

  if (flag === "--crm-seed") {
    job = require("./seed").cliSeed();
  } else if (flag === "--crm-create-user") {
    job = require("./scripts/create-crm-user").main(args);
  } else if (flag === "--crm-migrate") {
    job = require("./scripts/migrate-db-json").main(args);
  } else {
    console.error("Comando desconocido: " + flag);
    console.error("Disponibles: --crm-seed, --crm-create-user, --crm-migrate");
    process.exit(1);
  }

  Promise.resolve(job).catch((err) => {
    console.error("Fallo:", err && err.message ? err.message : err);
    process.exit(1);
  });
  return true;
}

module.exports = { run };
