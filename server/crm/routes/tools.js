// Herramientas de operacion: sincronizar, comprobar el token, probar CAPI,
// probar el envio de mensajes e importar CSV. Traduccion de
// src/app/api/{sync,check-token,capi-test,messaging-test,import-csv}.

const express = require("express");
const { asyncHandler } = require("./util");
const { syncFacebookLeads, checkFacebookTokenValidity } = require("../services/facebook/sync");
const { sendCapiEvent } = require("../services/facebook/capi");
const { getSyncState } = require("../services/repo/syncState");
const { getLead } = require("../services/repo/leads");
const { createLead } = require("../services/leads");
const { sendEmail } = require("../services/messaging/email");
const { sendSms } = require("../services/messaging/sms");
const { sendWhatsapp } = require("../services/messaging/whatsapp");

const router = express.Router();

// Estas cinco rutas mueven datos y gastan APIs de terceros, asi que a diferencia
// del CRM original (sin auth) ahora exigen sesion. Son las que un atacante
// usaria para vaciar la agenda o vaciar la cuenta de Twilio.

router.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const result = await syncFacebookLeads();
    res.status(result.ok ? 200 : 502).json(result);
  })
);

router.post(
  "/check-token",
  asyncHandler(async (req, res) => {
    await checkFacebookTokenValidity();
    const { tokenValid, tokenCheckedAt, tokenCheckError } = await getSyncState();
    res.json({ tokenValid, tokenCheckedAt, tokenCheckError });
  })
);

router.post(
  "/capi-test",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.leadId) return res.status(400).json({ error: "leadId is required" });

    const lead = await getLead(body.leadId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const result = await sendCapiEvent(lead, body.stageName || lead.stage);
    res.status(result.ok ? 200 : 502).json(result);
  })
);

router.post(
  "/messaging-test",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { channel, to } = body;

    if (!channel || !to) return res.status(400).json({ error: "channel and to are required" });

    const testBody = "This is a test message from the Reforma Dental CRM.";
    let result;

    if (channel === "email") {
      result = await sendEmail({ to, subject: "Reforma Dental CRM - test message", text: testBody });
    } else if (channel === "sms") {
      result = await sendSms(to, testBody);
    } else if (channel === "whatsapp") {
      result = await sendWhatsapp(to, testBody);
    } else {
      return res.status(400).json({ error: `Unknown channel "${channel}"` });
    }

    res.status(result.ok ? 200 : 502).json(result);
  })
);

/**
 * Espera un CSV sencillo con cabecera "name" y, opcionalmente, "email" y
 * "phone":
 *   name,email,phone
 *   Jane Doe,jane@example.com,555-0100
 *
 * Limitaciones que arrastra el parser original y que conviene conocer: parte por
 * comas sin respetar comillas, asi que un nombre con coma ("Perez, Ana") se
 * parte en dos columnas. Para una lista de 18 leads no importa; para una de 500
 * importada de otro CRM si, y ahi haria falta un parser de verdad.
 */
router.post(
  "/import-csv",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const csvText = body.csv;
    if (!csvText || typeof csvText !== "string") {
      return res.status(400).json({ error: "csv (string) is required" });
    }

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const nameIdx = headers.indexOf("name");
    const emailIdx = headers.indexOf("email");
    const phoneIdx = headers.indexOf("phone");

    if (nameIdx === -1) {
      return res.status(400).json({ error: 'CSV header must include a "name" column' });
    }

    let created = 0;
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim());
      const name = cols[nameIdx];
      if (!name) continue;

      await createLead({
        name,
        email: emailIdx !== -1 ? cols[emailIdx] || null : null,
        phone: phoneIdx !== -1 ? cols[phoneIdx] || null : null,
        source: "csv",
      });
      created += 1;
    }

    res.json({ created });
  })
);

module.exports = router;
