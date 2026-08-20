import webpush from "web-push";
import { publicOrigin } from "./config.js";
import { query } from "./db.js";

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string | null;
  tag?: string;
  data?: { url?: string; module?: "calendar" | "mail" };
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function abs(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${publicOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function markSent(userId: string, kind: string, ref: string): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO notification_sent (user_id, kind, ref)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, kind, ref],
  );
  return (rowCount ?? 0) > 0;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const { rows } = await query<SubRow>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [userId],
  );
  if (!rows.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: abs(payload.icon || "/icons/icon-192.png"),
    badge: abs(payload.badge || "/icons/icon-192.png"),
    image: payload.image ? abs(payload.image) : undefined,
    tag: payload.tag,
    data: {
      url: payload.data?.url || "/",
      module: payload.data?.module,
    },
  });

  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        { TTL: 60 * 60, urgency: "high" },
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
      } else {
        console.error("Web-Push:", err);
      }
    }
  }
  return sent;
}
