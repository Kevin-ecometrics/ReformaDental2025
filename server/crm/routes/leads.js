// Endpoints de leads: listar, crear, ver detalle, editar contacto/etapa/notas, exportar
// CSV y mandar un mensaje. Traduccion de src/app/api/leads/**.
//
// Nota sobre el orden: /export se declara ANTES que /:id. En Express las rutas
// se resuelven en orden de registro, y si /:id fuera primero se tragaria la
// palabra "export" como si fuera un id.

const express = require("express");
const { asyncHandler } = require("./util");
const { requireAdmin } = require("../auth");
const { listLeads, getLead, setLeadArchived, deleteLead } = require("../services/repo/leads");
const { listActivities, addActivity } = require("../services/repo/activities");
const { listTasks } = require("../services/repo/tasks");
const { createLead, changeLeadStage, updateLeadNotes, updateLeadContact } = require("../services/leads");
const { parseContactPatch } = require("../services/leadContact");
const { findDuplicates } = require("../services/matching");
const { scheduledTaskOptions } = require("../services/appointments");
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

/** Lo minimo para avisar y abrir el otro lead, sin mandar sus datos completos. */
async function listDuplicates(contact) {
  const leads = await listLeads({ includeArchived: true });
  return findDuplicates(contact, leads).map(({ id, name, stage, archivedAt }) => ({ id, name, stage, archivedAt }));
}

router.get(
  "/leads",
  asyncHandler(async (req, res) => {
    res.json({ leads: await listLeads({ includeArchived: req.query.includeArchived === "1" }) });
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

// Antes que /leads/:id, por el mismo motivo que /leads/export.
router.get(
  "/leads/duplicates",
  asyncHandler(async (req, res) => {
    const { phone, email } = req.query;
    res.json({
      duplicates: await listDuplicates({
        phone: typeof phone === "string" ? phone : null,
        email: typeof email === "string" ? email : null,
      }),
    });
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
    // Es solo un aviso: si la busqueda falla, la ficha se abre igual.
    const duplicates = await listDuplicates(lead).catch((err) => {
      console.error(`[crm/leads] no se pudieron buscar duplicados de ${lead.id}:`, err.message);
      return [];
    });

    return res.json({ lead, activities, tasks, duplicates });
  })
);

router.patch(
  "/leads/:id",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    let lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // Se valida antes de escribir: un dato invalido no debe dejar la etapa ya movida.
    const { patch, error } = parseContactPatch(body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(patch).length > 0) {
      lead = (await updateLeadContact(req.params.id, patch)) || lead;
    }

    // El orden importa: primero la etapa (dispara CAPI y reglas) y despues las
    // notas, como en la version original.
    if (typeof body.stage === "string") {
      const options = body.stage === "scheduled" && lead.stage !== "scheduled" ? await scheduledTaskOptions(lead) : undefined;
      lead = (await changeLeadStage(req.params.id, body.stage, options)) || lead;
    }
    if (typeof body.notes === "string") {
      lead = (await updateLeadNotes(req.params.id, body.notes)) || lead;
    }

    return res.json({ lead });
  })
);

// Archivar y restaurar. No disparan CAPI ni reglas: solo ocultan o muestran el
// lead. Repetir la misma accion no escribe ni duplica la actividad.
for (const [action, archived] of [["archive", true], ["restore", false]]) {
  router.post(
    `/leads/:id/${action}`,
    asyncHandler(async (req, res) => {
      const lead = await getLead(req.params.id);
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      if (Boolean(lead.archivedAt) === archived) return res.json({ lead });

      const updated = await setLeadArchived(lead.id, archived);
      await addActivity(lead.id, "system", archived ? "Lead archived" : "Lead restored");
      return res.json({ lead: updated });
    })
  );
}

// Los de Facebook no se borran: el siguiente sync los recrearia y mandaria otro
// "New" real a Meta. Para esos esta archivar.
router.delete(
  "/leads/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const lead = await getLead(req.params.id);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.source === "facebook" || lead.fbLeadgenId) {
      return res.status(409).json({ error: "Facebook leads cannot be deleted. Archive it instead." });
    }

    await deleteLead(lead, req.user.name);
    return res.json({ ok: true });
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
