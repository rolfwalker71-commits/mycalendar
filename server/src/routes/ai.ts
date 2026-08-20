import { Router } from "express";
import { DateTime } from "luxon";
import { requireAuth } from "../auth.js";
import { TZ } from "../config.js";
import { query } from "../db.js";
import { cachedGemini, geminiAvailable, loadGeminiKey } from "../gemini.js";
import { GoogleAuthError, getAuthedGmail, isInsufficientScope } from "../google.js";
import { headerMap, parseAddress, parsePayload } from "../mailMime.js";

export const aiRouter = Router();
aiRouter.use(requireAuth);

function clip(text: string, max: number): string {
  const t = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

aiRouter.get("/status", async (_req, res) => {
  await loadGeminiKey();
  res.json({ available: geminiAvailable() });
});

aiRouter.post("/mail", async (req, res) => {
  await loadGeminiKey();
  if (!geminiAvailable()) {
    res.status(503).json({
      error:
        "Gemini-Übersichten aus Gmail sind per API nicht lesbar. Für eigene Zusammenfassungen GEMINI_API_KEY in .env setzen.",
      code: "gemini_config",
    });
    return;
  }
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  const threaded = req.body?.threaded !== false;
  if (!id) {
    res.status(400).json({ error: "id fehlt." });
    return;
  }
  try {
    const gmail = await getAuthedGmail(req.user!);
    const messages = threaded
      ? (
          await gmail.users.threads.get({
            userId: "me",
            id,
            format: "full",
          })
        ).data.messages ?? []
      : [
          (
            await gmail.users.messages.get({
              userId: "me",
              id,
              format: "full",
            })
          ).data,
        ];
    const lastId = messages[messages.length - 1]?.id ?? id;
    const parts = messages.slice(-12).map((message) => {
      const headers = headerMap(message.payload?.headers);
      const from = parseAddress(headers.from);
      const parsed = parsePayload(message.payload);
      const body = clip(parsed.text || parsed.html || message.snippet || "", 1800);
      return `Von: ${from.name || from.email}\nBetreff: ${headers.subject || ""}\n${body}`;
    });
    const prompt = `Fasse diese E-Mail-Unterhaltung auf Deutsch knapp zusammen.
Nenne Absender, das eigentliche Anliegen, offene Punkte oder Termine, und was als Nächstes zu tun ist.
Keine Floskeln, keine Erfindung. Maximal 8 Sätze, gerne Stichpunkte.

${parts.join("\n\n---\n\n")}`;
    const result = await cachedGemini(req.user!.id, "mail", `${id}:${lastId}`, prompt);
    res.json({ text: result.text, cached: result.cached });
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      res.status(err.code === "gmail_scope" ? 403 : 401).json({ error: err.message, code: err.code });
      return;
    }
    if (isInsufficientScope(err)) {
      res.status(403).json({ error: "Mail nicht freigegeben.", code: "gmail_scope" });
      return;
    }
    const gemini = geminiFailure(err);
    if (gemini) {
      res.status(gemini.status).json({ error: gemini.error, code: gemini.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Zusammenfassung fehlgeschlagen." });
  }
});

aiRouter.post("/calendar", async (req, res) => {
  await loadGeminiKey();
  if (!geminiAvailable()) {
    res.status(503).json({
      error:
        "Gemini-Tagesüberblicke aus Google Kalender sind per API nicht lesbar. Für eigene Zusammenfassungen GEMINI_API_KEY in .env setzen.",
      code: "gemini_config",
    });
    return;
  }
  const from = typeof req.body?.from === "string" ? req.body.from : "";
  const to = typeof req.body?.to === "string" ? req.body.to : "";
  if (!from || !to) {
    res.status(400).json({ error: "from/to fehlen." });
    return;
  }
  const start = DateTime.fromISO(from, { zone: TZ });
  const end = DateTime.fromISO(to, { zone: TZ });
  if (!start.isValid || !end.isValid) {
    res.status(400).json({ error: "Ungültiger Zeitraum." });
    return;
  }
  try {
    const { rows } = await query<{
      summary: string | null;
      location: string | null;
      description: string | null;
      start_at: Date | null;
      end_at: Date | null;
      all_day: boolean;
      hangout_link: string | null;
      calendar_summary: string | null;
    }>(
      `SELECT e.summary, e.location, e.description, e.start_at, e.end_at, e.all_day,
              e.hangout_link, c.summary AS calendar_summary
         FROM events e
         JOIN calendars c ON c.id = e.calendar_id
        WHERE e.user_id = $1
          AND c.selected
          AND e.status IS DISTINCT FROM 'cancelled'
          AND (
            (e.all_day AND e.all_day_start < $3::date AND (e.all_day_end IS NULL OR e.all_day_end > $2::date))
            OR (e.all_day = FALSE AND e.start_at < $5 AND (e.end_at IS NULL OR e.end_at > $4))
          )
        ORDER BY e.all_day DESC, e.start_at ASC
        LIMIT 40`,
      [
        req.user!.id,
        start.toISODate(),
        end.toISODate(),
        start.toUTC().toJSDate(),
        end.toUTC().toJSDate(),
      ],
    );
    const lines = rows.map((ev) => {
      const when = ev.all_day
        ? "ganztägig"
        : ev.start_at
          ? DateTime.fromJSDate(ev.start_at).setZone(TZ).toFormat("HH:mm")
          : "";
      return [
        `${when} ${ev.summary || "Ohne Titel"}`,
        ev.location,
        ev.hangout_link ? "Google Meet" : "",
        ev.calendar_summary,
        clip(ev.description || "", 220),
      ]
        .filter(Boolean)
        .join(" · ");
    });
    const label = start.hasSame(end.minus({ milliseconds: 1 }), "day")
      ? start.setLocale("de").toFormat("cccc, d. LLLL")
      : `${start.setLocale("de").toFormat("d. LLL")}–${end.setLocale("de").toFormat("d. LLL")}`;
    const prompt = `Du bist ein knapper Kalenderassistent. Fasse den folgenden Zeitraum auf Deutsch zusammen (${label}).
Erwähne Engpässe, Lücken, Fahrten/Meet-Links und was vorbereitet werden sollte.
Maximal 6 Sätze oder Stichpunkte. Nichts erfinden.

${lines.join("\n") || "Keine Termine."}`;
    const ref = `${start.toISODate()}:${end.toISODate()}:${rows.length}`;
    const result = await cachedGemini(req.user!.id, "calendar", ref, prompt);
    res.json({ text: result.text, cached: result.cached });
  } catch (err) {
    const gemini = geminiFailure(err, "Tagesüberblick fehlgeschlagen.");
    if (gemini) {
      res.status(gemini.status).json({ error: gemini.error, code: gemini.code });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Tagesüberblick fehlgeschlagen." });
  }
});

function geminiFailure(
  err: unknown,
  fallback = "Zusammenfassung fehlgeschlagen.",
): { status: number; error: string; code: string } | null {
  const code = (err as { code?: string }).code;
  if (code === "gemini_config") {
    return { status: 503, error: (err as Error).message || fallback, code };
  }
  if (code === "gemini" || code === "gemini_billing") {
    const status = Number((err as { status?: number }).status);
    return {
      status: Number.isFinite(status) && status >= 400 ? status : 502,
      error: (err as Error).message || fallback,
      code,
    };
  }
  return null;
}
