// Endpoints de tareas y del dashboard. Traduccion de src/app/api/tasks/** y
// src/app/api/dashboard.

const express = require("express");
const { asyncHandler } = require("./util");
const { listTasks, completeTask, createTask } = require("../services/repo/tasks");
const { listLeads, getLead, touchLead } = require("../services/repo/leads");
const { listActivities, addActivity } = require("../services/repo/activities");
const { listStages } = require("../services/repo/stages");

const router = express.Router();

const MAX_TASK_LENGTH = 500;

// Tarea manual desde la ficha del lead. Las de las reglas se siguen creando en
// automation.js; las dos van a la misma tabla y al mismo panel.
router.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const dueAtMs = typeof body.dueAt === "string" ? Date.parse(body.dueAt) : NaN;

    if (typeof body.leadId !== "string" || !body.leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }
    if (!description) return res.status(400).json({ error: "description is required" });
    if (description.length > MAX_TASK_LENGTH) {
      return res.status(400).json({ error: `description must be at most ${MAX_TASK_LENGTH} characters` });
    }
    if (Number.isNaN(dueAtMs)) return res.status(400).json({ error: "dueAt must be a valid date" });

    const lead = await getLead(body.leadId);
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const task = await createTask(lead.id, description, new Date(dueAtMs).toISOString());
    await addActivity(lead.id, "system", `Task added: ${description}`);
    // Agendar un pendiente tambien es trabajar el lead, igual que completar una tarea.
    await touchLead(lead.id);
    return res.status(201).json({ task });
  })
);

router.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    res.json({ tasks: await listTasks() });
  })
);

router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const task = await completeTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    return res.json({ task });
  })
);

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const [leads, tasks, activities, stages] = await Promise.all([
      listLeads(),
      listTasks(),
      listActivities(),
      listStages(),
    ]);

    const leadsByStage = stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      count: leads.filter((l) => l.stage === stage.id).length,
    }));

    // Los tres origenes se cuentan a mano, igual que antes. Si algun dia se anade
    // un origen nuevo habra que tocarlo aqui: es el mismo compromiso que la
    // version Next.js, sin cambiarlo.
    const leadsBySource = {
      facebook: leads.filter((l) => l.source === "facebook").length,
      manual: leads.filter((l) => l.source === "manual").length,
      csv: leads.filter((l) => l.source === "csv").length,
    };

    const nowMs = Date.now();
    const openTasks = tasks.filter((t) => !t.done);
    const overdueTasks = openTasks.filter((t) => new Date(t.dueAt).getTime() < nowMs);

    const messagesSent = activities.filter((a) => a.type === "message_sent").length;
    const messagesFailed = activities.filter((a) => a.type === "message_failed").length;

    // La etapa de conversion se busca por id o por nombre, y si no aparece se
    // usa la ultima. Mismo criterio que antes, para que cambiar el nombre "Won"
    // no rompa el porcentaje.
    const wonStage =
      stages.find((s) => s.id.toLowerCase() === "won" || s.name.toLowerCase() === "won") ||
      stages[stages.length - 1];

    const conversionRate =
      leads.length > 0 && wonStage
        ? Math.round((leads.filter((l) => l.stage === wonStage.id).length / leads.length) * 100)
        : 0;

    res.json({
      totalLeads: leads.length,
      leadsByStage,
      leadsBySource,
      tasksOpen: openTasks.length,
      tasksOverdue: overdueTasks.length,
      messagesSent,
      messagesFailed,
      conversionRate,
      conversionStageName: wonStage ? wonStage.name : null,
    });
  })
);

module.exports = router;
