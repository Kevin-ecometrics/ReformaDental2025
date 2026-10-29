// POST /crm/cron/tick -- lo que llama el Cron Jobs de cPanel cada 5 minutos.
//
// El cron interno (scheduler.js) vive dentro del proceso de la app y muere con el
// cuando el hosting lo detiene por falta de trafico. Esta ruta lo evita: es una
// peticion HTTP normal, asi que levanta la app si esta dormida y el trabajo corre
// dentro de ella, sin SSH ni la ruta del Node de cPanel.
//
// Va FUERA de requireAuth a proposito (el que llama es el cron, sin sesion) y se
// protege con su propio token, CRM_CRON_TOKEN, en la cabecera X-Cron-Token.
// Sin la variable, o con menos de 32 caracteres, la ruta queda apagada.
//
// Codigos:
//   200  el tick corrio; el cuerpo trae el resumen (puede traer ok:false si fallo
//        el sync: un fallo de Facebook no es un fallo de esta ruta, y asi el
//        cron de cPanel no manda un correo cada 5 minutos mientras dure)
//   202  ya habia un tick en curso, hubo uno hace menos de un minuto, o el actual
//        tarda mas de lo que esta ruta espera para responder; sigue en segundo plano
//   401  token ausente o incorrecto
//   503  la ruta esta apagada (falta CRM_CRON_TOKEN)

const crypto = require("node:crypto");
const express = require("express");
const { asyncHandler } = require("./util");
const { runTick } = require("../services/tick");

const router = express.Router();

const MIN_TOKEN_LENGTH = 32;

// Un tick normal dura segundos. Si pasa de aqui se responde 202 y se deja
// terminar, para que ni curl ni el proxy del hosting corten la peticion.
const RESPONSE_DEADLINE_MS = 45 * 1000;

/**
 * Compara en tiempo constante. Se hashea primero para que timingSafeEqual reciba
 * dos buffers del mismo largo y para no filtrar el largo del token real.
 * @param {unknown} received
 * @param {string} expected
 * @returns {boolean}
 */
function tokenMatches(received, expected) {
  if (typeof received !== "string" || received.length === 0) return false;
  const a = crypto.createHash("sha256").update(received).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

router.post(
  "/cron/tick",
  asyncHandler(async (req, res) => {
    const expected = process.env.CRM_CRON_TOKEN;
    if (!expected || expected.length < MIN_TOKEN_LENGTH) {
      return res.status(503).json({ error: "cron endpoint disabled" });
    }
    if (!tokenMatches(req.get("x-cron-token"), expected)) {
      return res.status(401).json({ error: "invalid token" });
    }

    const work = runTick("http");

    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), RESPONSE_DEADLINE_MS);
    });
    const outcome = await Promise.race([work, deadline]);
    clearTimeout(timer);

    if (outcome === null) return res.status(202).json({ status: "running" });
    if ("skipped" in outcome) return res.status(202).json({ status: "skipped", reason: outcome.reason });
    return res.json(outcome);
  })
);

module.exports = router;
