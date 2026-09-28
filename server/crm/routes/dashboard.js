// Endpoints de tareas y del dashboard. Traduccion de src/app/api/tasks/** y
// src/app/api/dashboard.

const express = require("express");
const { asyncHandler } = require("./util");
const { listTasks, completeTask } = require("../services/repo/tasks");
const { listLeads } = require("../services/repo/leads");
const { listActivities } = require("../services/repo/activities");
const { listStages } = require("../services/repo/stages");

const router = express.Router();

// No hay POST /tasks a proposito: las tareas las crean las reglas de
// automatizacion. El endpoint de creacion manual esta en el backlog.

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
