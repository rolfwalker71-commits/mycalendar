import { Router } from "express";
import { requireAuth } from "../auth.js";
import { describeGoogleApiError, getAuthedTasks } from "../google.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

function handleTasksError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  const described = describeGoogleApiError(err, "tasks");
  if (described) {
    res.status(described.status).json({ error: described.error, code: described.code });
    return true;
  }
  return false;
}

function mapTask(listId: string, t: { id?: string | null; title?: string | null; notes?: string | null; status?: string | null; due?: string | null; updated?: string | null }) {
  return {
    id: t.id ?? "",
    listId,
    title: t.title ?? "",
    notes: t.notes ?? "",
    status: t.status === "completed" ? "completed" : "needsAction",
    due: t.due ?? null,
    updated: t.updated ?? null,
  };
}

tasksRouter.get("/", async (req, res) => {
  try {
    const tasks = await getAuthedTasks(req.user!);
    const listsRes = await tasks.tasklists.list({ maxResults: 20 });
    const lists = (listsRes.data.items ?? []).filter((l) => l.id);
    const items = [];
    for (const list of lists) {
      const { data } = await tasks.tasks.list({
        tasklist: list.id!,
        showCompleted: true,
        showHidden: false,
        maxResults: 80,
      });
      for (const t of data.items ?? []) {
        if (t.deleted) continue;
        items.push({
          ...mapTask(list.id!, t),
          listTitle: list.title ?? "Aufgaben",
          source: "google" as const,
        });
      }
    }
    let msTasks: {
      id: string;
      listId: string;
      listTitle: string;
      title: string;
      notes?: string;
      status: "needsAction" | "completed";
      due: string | null;
      source: "microsoft";
    }[] = [];
    let msLists: { id: string; title: string; source: "microsoft" }[] = [];
    try {
      const { listMsTodos, listMsPlanner } = await import("../microsoft.js");
      const todos = await listMsTodos(req.user!);
      msTasks = todos.map((t) => ({ ...t, source: "microsoft" as const }));
      const seen = new Map<string, string>();
      for (const t of todos) seen.set(t.listId, t.listTitle);
      msLists = [...seen.entries()].map(([id, title]) => ({ id, title, source: "microsoft" as const }));
      const planner = await listMsPlanner(req.user!);
      for (const p of planner) {
        msTasks.push({
          id: p.id,
          listId: `msplan:${p.planId}`,
          listTitle: `Planner · ${p.planTitle}`,
          title: p.title,
          status: p.percentComplete >= 100 ? "completed" : "needsAction",
          due: p.due,
          source: "microsoft",
        });
        if (!msLists.some((l) => l.id === `msplan:${p.planId}`)) {
          msLists.push({
            id: `msplan:${p.planId}`,
            title: `Planner · ${p.planTitle}`,
            source: "microsoft",
          });
        }
      }
    } catch (err) {
      console.warn("MS-Aufgaben:", err);
    }
    res.json({
      lists: [
        ...lists.map((l) => ({ id: l.id, title: l.title ?? "Aufgaben", source: "google" as const })),
        ...msLists,
      ],
      tasks: [...items, ...msTasks],
    });
  } catch (err) {
    if (handleTasksError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Aufgaben konnten nicht geladen werden." });
  }
});

tasksRouter.post("/", async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const listId = typeof req.body?.listId === "string" ? req.body.listId : "";
  const due = typeof req.body?.due === "string" ? req.body.due : undefined;
  const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
  if (!title) {
    res.status(400).json({ error: "Titel fehlt." });
    return;
  }
  try {
    const api = await getAuthedTasks(req.user!);
    let tasklist = listId;
    if (!tasklist) {
      const lists = await api.tasklists.list({ maxResults: 1 });
      tasklist = lists.data.items?.[0]?.id ?? "";
    }
    if (!tasklist) {
      res.status(400).json({ error: "Keine Aufgabenliste gefunden." });
      return;
    }
    const { data } = await api.tasks.insert({
      tasklist,
      requestBody: { title, due, notes },
    });
    res.status(201).json({ task: mapTask(tasklist, data) });
  } catch (err) {
    if (handleTasksError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Aufgabe konnte nicht erstellt werden." });
  }
});

tasksRouter.patch("/:listId/:id", async (req, res) => {
  try {
    const api = await getAuthedTasks(req.user!);
    const status =
      req.body?.status === "completed"
        ? "completed"
        : req.body?.status === "needsAction"
          ? "needsAction"
          : undefined;
    const due =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "due")
        ? req.body.due === null || req.body.due === ""
          ? null
          : typeof req.body.due === "string"
            ? req.body.due
            : undefined
        : undefined;
    const { data } = await api.tasks.patch({
      tasklist: req.params.listId,
      task: req.params.id,
      requestBody: {
        title: typeof req.body?.title === "string" ? req.body.title : undefined,
        notes: typeof req.body?.notes === "string" ? req.body.notes : undefined,
        due,
        status,
      },
    });
    res.json({ task: mapTask(req.params.listId, data) });
  } catch (err) {
    if (handleTasksError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Aufgabe konnte nicht gespeichert werden." });
  }
});

tasksRouter.delete("/:listId/:id", async (req, res) => {
  try {
    const api = await getAuthedTasks(req.user!);
    await api.tasks.delete({ tasklist: req.params.listId, task: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleTasksError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Aufgabe konnte nicht gelöscht werden." });
  }
});
