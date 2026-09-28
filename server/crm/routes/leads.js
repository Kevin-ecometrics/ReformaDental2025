// Endpoints de leads: listar, crear, ver detalle, editar etapa/notas, exportar
// CSV y mandar un mensaje. Traduccion de src/app/api/leads/**.
//
// Nota sobre el orden: /export se declara ANTES que /:id. En Express las rutas
// se resuelven en orden de registro, y si /:id fuera primero se tragaria la
// palabra "export" como si fuera un id.

const express = require("express");
const { asyncHandler } = require("./util");
const { listLeads, getLead } = require("../services/repo/leads");
const { listActivities } = require("../services/repo/activities");
const { listTasks } = require("../services/repo/tasks");
const { createLead, changeLeadStage, updateLeadNotes } = require("../services/leads");
const { sendMessageToLead } = require("../services/messaging");

const router = express.Router();

/** Columnas del CSV, en el mismo orden y con los mismos nombres que antes. */
const CSV_COLUMNS = [
  "id",
  "name",
  "email",
  "phone",
  "source",
  "campaignName",
  "adName",
  "formName",
  "stage",
  "notes",
  "createdAt",
  "updatedAt",
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

router.get(
  "/leads",
  asyncHandler(async (req, res) => {
    res.json({ leads: await listLeads() });
  })
);

router.post(
  "/leads",
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    if (!body.name || typeof body.name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    const { lead } = await createLead({
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source || "manual",
      notes: body.notes ?? "",
    });

    return res.status(201).json({ lead });
  })
);

router.get(
  "/leads/export",
  asyncHandler(async (req, res) => {
    const leads = await listLeads();
    const rows = [
      CSV_COLUMNS.join(","),
      ...leads.map((lead) => CSV_COLUMNS.map((col) => csvEscape(lead[col])).join(",")),
    ];

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${date}.csv"`);
    // BOM: sin el, Excel abre los acentos de "Reforma Dental" como caracteres
    // raros, que es el primer soporte que le pides a un usuario no tecnico.
    res.send("﻿" + rows.join("\n"));
  })
);

router.get(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const [activities, tasks] = await Promise.all([
      listActivities(req.params.id),
      listTasks(req.params.id),
    ]);

    return res.json({ lead, activities, tasks });
  })
);

router.patch(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    let lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // El orden importa: primero la etapa (dispara CAPI y reglas) y despues las
    // notas, como en la version original.
    if (typeof body.stage === "string") {
      lead = (await changeLeadStage(req.params.id, body.stage)) || lead;
    }
    if (typeof body.notes === "string") {
      lead = (await updateLeadNotes(req.params.id, body.notes)) || lead;
    }

    return res.json({ lead });
  })
);

router.post(
  "/leads/:id/send",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { channel, templateKey } = body;

    if (!channel || !templateKey) {
      return res.status(400).json({ error: "channel and templateKey are required" });
    }

    const lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const result = await sendMessageToLead(lead, channel, templateKey);
    // 502 y no 500: el CRM esta bien, el proveedor de mensaje esta caido. El
    // frontend usa ese codigo para distinguir "reintentalo" de "esta roto".
    return res.status(result.ok ? 200 : 502).json(result);
  })
);

module.exports = router;
