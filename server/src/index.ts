import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { DateTime, Settings } from "luxon";
import { APP_PORT, NODE_ENV, TZ, ALLOWED_GOOGLE_EMAILS } from "./config.js";
import { healthCheck, initSchema, query } from "./db.js";
import { getLastSeen } from "./auth.js";
import { loadUserById } from "./auth.js";
import { GoogleAuthError } from "./google.js";
import { runNotificationJobs } from "./notify.js";
import { syncUserEvents } from "./sync.js";
import { loadVapidKeys } from "./vapid.js";
import { authRouter } from "./routes/auth.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { googlePushRouter, meRouter, syncRouter } from "./routes/me.js";
import { searchRouter } from "./routes/search.js";
import { mailRouter } from "./routes/mail.js";
import { tasksRouter } from "./routes/tasks.js";
import { pushRouter } from "./routes/push.js";
import { aiRouter } from "./routes/ai.js";
import { weatherRouter } from "./routes/weather.js";
import { mapsRouter } from "./routes/maps.js";
import { loadGeminiKey } from "./gemini.js";

Settings.defaultZone = TZ;
Settings.defaultLocale = "de";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, "../web/dist");

const app = express();

if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameSrc: ["'self'", "blob:"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://accounts.google.com"],
        frameAncestors: ["'none'"],
        // Lokal über HTTP: sonst versucht der Browser Assets auf HTTPS zu laden.
        upgradeInsecureRequests: NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: NODE_ENV === "production",
  }),
);

app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  const ok = await healthCheck();
  if (!ok) {
    res.status(503).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/calendars", calendarsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/search", searchRouter);
app.use("/api/mail", mailRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/push", pushRouter);
app.use("/api/ai", aiRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/maps", mapsRouter);
app.use("/api/sync", syncRouter);
app.use("/api/google", googlePushRouter);

app.use(
  express.static(webDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith(`${path.sep}sw.ts`) || filePath.endsWith(`${path.sep}workbox-window.js`)) {
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Service-Worker-Allowed", "/");
      }
      if (filePath.endsWith(".webmanifest")) {
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof GoogleAuthError) {
      const status = err.code === "gmail_scope" ? 403 : 401;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Ein Fehler ist aufgetreten." });
  },
);

async function userIdsToSync(): Promise<string[]> {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const ids = new Set<string>();
  for (const [userId, seen] of getLastSeen()) {
    if (seen >= cutoff) ids.add(userId);
  }
  const { rows } = await query<{ user_id: string }>(
    "SELECT DISTINCT user_id FROM push_subscriptions",
  );
  for (const row of rows) ids.add(row.user_id);
  return [...ids];
}

async function backgroundSync(): Promise<void> {
  const now = DateTime.now().setZone(TZ);
  const timeMin = now.minus({ months: 1 }).startOf("day").toUTC().toISO() ?? undefined;
  const timeMax = now.plus({ months: 2 }).endOf("day").toUTC().toISO() ?? undefined;
  for (const userId of await userIdsToSync()) {
    const user = await loadUserById(userId);
    if (!user?.refresh_token_enc) continue;
    try {
      await syncUserEvents(user, timeMin, timeMax);
    } catch (err) {
      console.error("Hintergrund-Sync:", err);
    }
  }
  await runNotificationJobs();
  await query("DELETE FROM oauth_states WHERE expires_at < NOW()");
}

async function main(): Promise<void> {
  await initSchema();
  await loadVapidKeys();
  await loadGeminiKey();
  app.listen(APP_PORT, "0.0.0.0", () => {
    console.log(`Kalender & Mail lauscht auf Port ${APP_PORT}`);
    if (ALLOWED_GOOGLE_EMAILS.length) {
      console.log(`Login nur für ${ALLOWED_GOOGLE_EMAILS.length} Google-Konten.`);
    } else if (NODE_ENV === "production") {
      console.warn("ALLOWED_GOOGLE_EMAILS fehlt — Anmeldung in production ist gesperrt.");
    }
  });
  setTimeout(() => {
    backgroundSync().catch((err) => console.error(err));
  }, 5_000);
  setInterval(() => {
    backgroundSync().catch((err) => console.error(err));
  }, 60_000);
}

main().catch((err) => {
  console.error("Start fehlgeschlagen:", err);
  process.exit(1);
});
