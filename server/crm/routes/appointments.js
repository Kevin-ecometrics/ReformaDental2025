// Citas del calendario del sitio, para la pestana "Web" del pipeline. Van
// detras de requireAuth (ver index.js), a diferencia de /api/appointments del
// calendario, que hoy es publica.

const express = require("express");
const { asyncHandler } = require("./util");
const { listAppointmentsWithLeads, addAppointmentToCrm } = require("../services/appointments");

const router = express.Router();

router.get(
  "/appointments",
  asyncHandler(async (req, res) => {
    res.json({ appointments: await listAppointmentsWithLeads() });
  })
);

router.post(
  "/appointments/:id/lead",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid appointment id" });

    const result = await addAppointmentToCrm(id);
    if (!result) return res.status(404).json({ error: "Appointment not found" });

    return res.status(result.created ? 201 : 200).json(result);
  })
);

module.exports = router;
