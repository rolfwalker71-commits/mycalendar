import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, loadUserById } from "../auth.js";
import { publicOrigin } from "../config.js";
import { decrypt } from "../crypto.js";
import { query } from "../db.js";
import { downloadDriveBytes } from "../google.js";
import { loadCoverFile, widgetCover } from "../shiftCover.js";
import type { EventAttachmentJson } from "../types.js";
import {
  buildWidgetPayload,
  hashWidgetToken,
  looksLikeWidgetToken,
  newWidgetToken,
  type WidgetRow,
} from "../widgets.js";
import {
  isWidgetKind,
  normalizeWidgetConfig,
  type WidgetKind,
  type WidgetSummary,
} from "../shared/widgets.js";

const MAX_WIDGETS = 20;

function summarize(row: WidgetRow): WidgetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: normalizeWidgetConfig(row.config),
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
  };
}

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, 60) : "";
  return name || "Widget";
}

/** Only calendar ids the user owns end up in a widget config. */
async function ownCalendarIds(userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM calendars WHERE user_id = $1 AND id = ANY($2::uuid[])",
    [userId, ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id))],
  );
  const owned = new Set(rows.map((r) => r.id));
  return ids.filter((id) => owned.has(id));
}

// ---------------------------------------------------------------------------
// Management (app session): /api/widgets
// ---------------------------------------------------------------------------

export const widgetsRouter = Router();
widgetsRouter.use(requireAuth);

widgetsRouter.get("/", async (req, res) => {
  const { rows } = await query<WidgetRow>(
    "SELECT * FROM widgets WHERE user_id = $1 ORDER BY created_at ASC",
    [req.user!.id],
  );
  res.json({ widgets: rows.map(summarize) });
});

widgetsRouter.post("/", async (req, res) => {
  const userId = req.user!.id;
  const { rows: count } = await query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM widgets WHERE user_id = $1",
    [userId],
  );
  if (Number(count[0]?.n ?? 0) >= MAX_WIDGETS) {
    res.status(400).json({ error: `Höchstens ${MAX_WIDGETS} Widgets.` });
    return;
  }
  const kind: WidgetKind = isWidgetKind(req.body?.kind) ? req.body.kind : "calendar";
  const config = normalizeWidgetConfig(req.body?.config);
  config.calendarIds = await ownCalendarIds(userId, config.calendarIds);
  const token = newWidgetToken();
  const { rows } = await query<WidgetRow>(
    `INSERT INTO widgets (user_id, name, kind, config, token_hash, token_enc)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING *`,
    [userId, cleanName(req.body?.name), kind, JSON.stringify(config), token.hash, token.enc],
  );
  res.status(201).json({ widget: summarize(rows[0]!), token: token.token });
});

widgetsRouter.patch("/:id", async (req, res) => {
  const userId = req.user!.id;
  const { rows: found } = await query<WidgetRow>(
    "SELECT * FROM widgets WHERE id = $1 AND user_id = $2",
    [req.params.id, userId],
  );
  const current = found[0];
  if (!current) {
    res.status(404).json({ error: "Widget nicht gefunden." });
    return;
  }
  const kind: WidgetKind = isWidgetKind(req.body?.kind) ? req.body.kind : current.kind;
  const config = normalizeWidgetConfig(req.body?.config ?? current.config);
  config.calendarIds = await ownCalendarIds(userId, config.calendarIds);
  const name = req.body?.name === undefined ? current.name : cleanName(req.body.name);
  const { rows } = await query<WidgetRow>(
    `UPDATE widgets SET name = $3, kind = $4, config = $5::jsonb
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [current.id, userId, name, kind, JSON.stringify(config)],
  );
  res.json({ widget: summarize(rows[0]!) });
});

widgetsRouter.delete("/:id", async (req, res) => {
  await query("DELETE FROM widgets WHERE id = $1 AND user_id = $2", [req.params.id, req.user!.id]);
  res.json({ ok: true });
});

/** The token is stored encrypted so the script can be copied again on another device. */
widgetsRouter.get("/:id/token", async (req, res) => {
  const { rows } = await query<WidgetRow>(
    "SELECT * FROM widgets WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user!.id],
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Widget nicht gefunden." });
    return;
  }
  try {
    res.json({ token: decrypt(row.token_enc) });
  } catch {
    res.status(409).json({ error: "Schlüssel nicht lesbar. Bitte neuen Schlüssel erzeugen." });
  }
});

/** New token; scripts with the old one stop working immediately. */
widgetsRouter.post("/:id/rotate", async (req, res) => {
  const token = newWidgetToken();
  const { rows } = await query<WidgetRow>(
    `UPDATE widgets SET token_hash = $3, token_enc = $4
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [req.params.id, req.user!.id, token.hash, token.enc],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Widget nicht gefunden." });
    return;
  }
  res.json({ widget: summarize(rows[0]), token: token.token });
});

// ---------------------------------------------------------------------------
// Data for Scriptable (widget token, read-only): /api/widget/data
// ---------------------------------------------------------------------------

function bearer(req: Request): string {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

export const widgetDataRouter = Router();

widgetDataRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 180,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const token = bearer(req);
      return token ? hashWidgetToken(token) : (req.ip ?? "anon");
    },
    message: { error: "Zu viele Abrufe. Bitte später erneut." },
  }),
);

/** Resolves a widget token to its widget row, or answers 401. */
async function widgetFromRequest(req: Request): Promise<WidgetRow | null> {
  const token = bearer(req);
  if (!looksLikeWidgetToken(token)) return null;
  const { rows } = await query<WidgetRow>("SELECT * FROM widgets WHERE token_hash = $1", [
    hashWidgetToken(token),
  ]);
  return rows[0] ?? null;
}

widgetDataRouter.get("/data", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = bearer(req);
  if (!looksLikeWidgetToken(token)) {
    res.status(401).json({ error: "Widget-Schlüssel fehlt.", code: "widget-token" });
    return;
  }
  const { rows } = await query<WidgetRow>("SELECT * FROM widgets WHERE token_hash = $1", [
    hashWidgetToken(token),
  ]);
  const widget = rows[0];
  if (!widget) {
    res.status(401).json({
      error: "Widget unbekannt oder Schlüssel erneuert. Skript in der App neu kopieren.",
      code: "widget-token",
    });
    return;
  }
  const user = await loadUserById(widget.user_id);
  if (!user) {
    res.status(401).json({ error: "Konto nicht gefunden.", code: "widget-token" });
    return;
  }
  const kindParam = req.query.kind;
  const kind = isWidgetKind(kindParam) ? kindParam : undefined;
  try {
    const payload = await buildWidgetPayload(
      user,
      { ...widget, config: normalizeWidgetConfig(widget.config) },
      publicOrigin(),
      kind,
    );
    await query("UPDATE widgets SET last_used_at = NOW() WHERE id = $1", [widget.id]);
    res.json(payload);
  } catch (err) {
    console.error("Widget-Daten:", err);
    res.status(502).json({ error: "Daten gerade nicht verfügbar." });
  }
});

/** Same artwork the app shows (shift illustrations, Drive images), for the widget's own events. */
widgetDataRouter.get("/cover/:eventId", async (req, res) => {
  const widget = await widgetFromRequest(req);
  if (!widget) {
    res.status(401).end();
    return;
  }
  const user = await loadUserById(widget.user_id);
  if (!user) {
    res.status(401).end();
    return;
  }
  const config = normalizeWidgetConfig(widget.config);
  const params: unknown[] = [req.params.eventId, widget.user_id];
  let calendarFilter = "AND c.selected = TRUE";
  if (config.calendarIds.length) {
    params.push(config.calendarIds);
    calendarFilter = "AND e.calendar_id = ANY($3::uuid[])";
  }
  const { rows } = await query<{
    google_event_id: string;
    summary: string | null;
    calendar_summary: string | null;
    attachments: EventAttachmentJson[] | null;
  }>(
    `SELECT e.google_event_id, e.summary, c.summary AS calendar_summary, e.attachments
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
      WHERE e.id = $1 AND e.user_id = $2 ${calendarFilter}`,
    params,
  );
  const event = rows[0];
  if (!event) {
    res.status(404).end();
    return;
  }
  try {
    const file = await loadCoverFile(
      {
        googleEventId: event.google_event_id,
        summary: event.summary,
        calendarSummary: event.calendar_summary,
        attachments: event.attachments,
      },
      async (fileId) => downloadDriveBytes(user, fileId),
    );
    if (!file) {
      res.status(404).end();
      return;
    }
    const version = typeof req.query.v === "string" ? req.query.v : "0";
    const small = await widgetCover(`${req.params.eventId}-${version}`, file);
    res.setHeader("Content-Type", small.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(small.buffer);
  } catch (err) {
    console.error("Widget-Cover:", err);
    res.status(404).end();
  }
});
