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
import { syncUserEvents } from "./sync.js";
import { authRouter } from "./routes/auth.js";
import { calendarsRouter } from "./routes/calendars.js";
import { eventsRouter } from "./routes/events.js";
import { googlePushRouter, meRouter, syncRouter } from "./routes/me.js";
import { searchRouter } from "./routes/search.js";

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
        imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
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

app.use(express.json({ limit: "256kb" }));
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
app.use("/api/sync", syncRouter);
app.use("/api/google", googlePushRouter);

app.use(
  express.static(webDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith(`${path.sep}workbox-window.js`)) {
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
      res.status(401).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Ein Fehler ist aufgetreten." });
  },
);

async function backgroundSync(): Promise<void> {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const now = DateTime.now().setZone(TZ);
  const timeMin = now.minus({ months: 1 }).startOf("day").toUTC().toISO() ?? undefined;
  const timeMax = now.plus({ months: 2 }).endOf("day").toUTC().toISO() ?? undefined;
  for (const [userId, seen] of getLastSeen()) {
    if (seen < cutoff) continue;
    const user = await loadUserById(userId);
    if (!user?.refresh_token_enc) continue;
    try {
      await syncUserEvents(user, timeMin, timeMax);
    } catch (err) {
      console.error("Hintergrund-Sync:", err);
    }
  }
  await query("DELETE FROM oauth_states WHERE expires_at < NOW()");
}

async function main(): Promise<void> {
  await initSchema();
  app.listen(APP_PORT, "0.0.0.0", () => {
    console.log(`Kalender lauscht auf Port ${APP_PORT}`);
    if (ALLOWED_GOOGLE_EMAILS.length) {
      console.log(`Login nur für ${ALLOWED_GOOGLE_EMAILS.length} Google-Konten.`);
    } else if (NODE_ENV === "production") {
      console.warn("ALLOWED_GOOGLE_EMAILS fehlt — Anmeldung in production ist gesperrt.");
    }
  });
  setInterval(() => {
    backgroundSync().catch((err) => console.error(err));
  }, 90_000);
}

main().catch((err) => {
  console.error("Start fehlgeschlagen:", err);
  process.exit(1);
});
