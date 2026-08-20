import { Router } from "express";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import { sendPushToUser } from "../push.js";
import { getVapidPublicKey } from "../vapid.js";

export const pushRouter = Router();
pushRouter.use(requireAuth);

pushRouter.get("/vapid", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

pushRouter.post("/subscribe", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  const p256dh = typeof req.body?.keys?.p256dh === "string" ? req.body.keys.p256dh : "";
  const auth = typeof req.body?.keys?.auth === "string" ? req.body.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    res.status(400).json({ error: "Ungültiges Push-Abo." });
    return;
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth`,
    [req.user!.id, endpoint, p256dh, auth],
  );
  res.json({ ok: true });
});

pushRouter.post("/unsubscribe", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (endpoint) {
    await query(
      "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
      [req.user!.id, endpoint],
    );
  } else {
    await query("DELETE FROM push_subscriptions WHERE user_id = $1", [req.user!.id]);
  }
  res.json({ ok: true });
});

pushRouter.post("/test", async (req, res) => {
  const sent = await sendPushToUser(req.user!.id, {
    title: "Kalender & Mail",
    body: "Testbenachrichtigung — so erscheinen Termine und neue Mails.",
    image: "/logo.png",
    tag: "push-test",
    data: { url: "/", module: "calendar" },
  });
  res.json({ ok: true, sent });
});
