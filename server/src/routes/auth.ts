import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { google } from "googleapis";
import { googleConfigured, isEmailAllowed, isMsEmailAllowed, msConfigured } from "../config.js";
import { encrypt } from "../crypto.js";
import { query } from "../db.js";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../auth.js";
import { authUrl, createOAuthClient } from "../google.js";
import {
  exchangeMsCode,
  fetchMsProfile,
  msAuthUrl,
  syncMicrosoftCalendars,
} from "../microsoft.js";
import { syncUserEvents } from "../sync.js";
import type { UserRow } from "../types.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
});

authRouter.use(authLimiter);

authRouter.get("/google", async (req, res) => {
  if (!googleConfigured()) {
    res.status(503).json({
      error:
        "Google OAuth ist nicht konfiguriert. Bitte GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET setzen.",
    });
    return;
  }
  const state = randomBytes(24).toString("hex");
  await query(
    `INSERT INTO oauth_states (state, expires_at)
     VALUES ($1, NOW() + INTERVAL '10 minutes')`,
    [state],
  );
  await query("DELETE FROM oauth_states WHERE expires_at < NOW()");
  res.redirect(authUrl(state));
});

authRouter.get("/google/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!code || !state) {
    res.status(400).send("Ungültige Anmeldung.");
    return;
  }
  const { rows: states } = await query<{ state: string }>(
    "DELETE FROM oauth_states WHERE state = $1 AND expires_at > NOW() RETURNING state",
    [state],
  );
  if (!states[0]) {
    res.status(400).send("Anmeldung abgelaufen. Bitte erneut versuchen.");
    return;
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const { data: profile } = await oauth2.userinfo.get();
    if (!profile.id || !profile.email) {
      res.status(400).send("Google hat kein Profil geliefert.");
      return;
    }
    if (!isEmailAllowed(profile.email)) {
      res.redirect("/?error=forbidden");
      return;
    }

    const refresh = tokens.refresh_token;
    const { rows: existing } = await query<UserRow>(
      "SELECT * FROM users WHERE google_sub = $1",
      [profile.id],
    );
    let user = existing[0];

    if (user) {
      const enc = refresh ? encrypt(refresh) : user.refresh_token_enc;
      const { rows } = await query<UserRow>(
        `UPDATE users SET
           email = $2, name = $3, picture_url = $4,
           refresh_token_enc = $5, token_expiry = $6, last_login_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          user.id,
          profile.email,
          profile.name ?? user.name,
          profile.picture ?? user.picture_url,
          enc,
          tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        ],
      );
      user = rows[0];
    } else {
      if (!refresh) {
        res
          .status(400)
          .send("Kein Refresh-Token erhalten. Bitte erneut anmelden (consent).");
        return;
      }
      const { rows } = await query<UserRow>(
        `INSERT INTO users (
           google_sub, email, name, picture_url, refresh_token_enc, token_expiry, last_login_at
         ) VALUES ($1,$2,$3,$4,$5,$6, NOW())
         RETURNING *`,
        [
          profile.id,
          profile.email,
          profile.name ?? null,
          profile.picture ?? null,
          encrypt(refresh),
          tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        ],
      );
      user = rows[0];
    }

    if (!user?.refresh_token_enc) {
      res.status(400).send("Bitte erneut anmelden.");
      return;
    }

    setSessionCookie(res, user);
    syncUserEvents(user).catch((err) => {
      console.error("Initiale Synchronisation fehlgeschlagen:", err);
    });
    res.redirect("/");
  } catch (err) {
    console.error("OAuth-Callback:", err);
    res.status(500).send("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
  }
});

authRouter.post("/logout", async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/microsoft", requireAuth, async (req, res) => {
  if (!msConfigured()) {
    res.status(503).json({
      error: "Microsoft OAuth ist nicht konfiguriert. Bitte MS_CLIENT_ID und MS_CLIENT_SECRET setzen.",
    });
    return;
  }
  const state = `ms:${req.user!.id}:${randomBytes(16).toString("hex")}`;
  await query(
    `INSERT INTO oauth_states (state, expires_at)
     VALUES ($1, NOW() + INTERVAL '10 minutes')`,
    [state],
  );
  await query("DELETE FROM oauth_states WHERE expires_at < NOW()");
  res.redirect(msAuthUrl(state));
});

authRouter.get("/microsoft/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!code || !state.startsWith("ms:")) {
    res.status(400).send("Ungültige Microsoft-Anmeldung.");
    return;
  }
  const { rows: states } = await query<{ state: string }>(
    "DELETE FROM oauth_states WHERE state = $1 AND expires_at > NOW() RETURNING state",
    [state],
  );
  if (!states[0]) {
    res.status(400).send("Anmeldung abgelaufen. Bitte erneut versuchen.");
    return;
  }
  const userId = state.split(":")[1];
  if (!userId) {
    res.status(400).send("Ungültiger Zustand.");
    return;
  }
  try {
    const tokens = await exchangeMsCode(code);
    const profile = await fetchMsProfile(tokens.access_token);
    const email = (profile.mail || profile.userPrincipalName || "").toLowerCase();
    if (!email || !isMsEmailAllowed(email)) {
      res.redirect("/?error=ms_forbidden");
      return;
    }
    if (!tokens.refresh_token) {
      res.status(400).send("Kein Microsoft-Refresh-Token. Bitte Admin-Consent und offline_access prüfen.");
      return;
    }
    const { rows } = await query<UserRow>(
      `UPDATE users SET
         ms_sub = $2,
         ms_email = $3,
         ms_refresh_token_enc = $4,
         ms_token_expiry = $5
       WHERE id = $1
       RETURNING *`,
      [
        userId,
        profile.id,
        email,
        encrypt(tokens.refresh_token),
        tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      ],
    );
    const user = rows[0];
    if (!user) {
      res.status(400).send("Sitzung nicht gefunden. Bitte zuerst mit Google anmelden.");
      return;
    }
    syncMicrosoftCalendars(user).catch((err) => console.error("MS-Sync:", err));
    res.redirect("/?ms=connected");
  } catch (err) {
    console.error("Microsoft-Callback:", err);
    res.status(500).send("Microsoft-Anmeldung fehlgeschlagen.");
  }
});

authRouter.post("/microsoft/disconnect", requireAuth, async (req, res) => {
  await query(
    `UPDATE users SET ms_sub = NULL, ms_email = NULL, ms_refresh_token_enc = NULL, ms_token_expiry = NULL
      WHERE id = $1`,
    [req.user!.id],
  );
  await query(
    `DELETE FROM events WHERE calendar_id IN (
       SELECT id FROM calendars WHERE user_id = $1 AND source = 'microsoft'
     )`,
    [req.user!.id],
  );
  await query(`DELETE FROM calendars WHERE user_id = $1 AND source = 'microsoft'`, [req.user!.id]);
  res.json({ ok: true });
});
