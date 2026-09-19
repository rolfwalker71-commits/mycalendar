import webpush from "web-push";
import { ALLOWED_GOOGLE_EMAILS, publicOrigin } from "./config.js";
import { query } from "./db.js";

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let cached: VapidKeys | null = null;

/**
 * Apple's push service (web.push.apple.com) rejects the JWT with 403 BadJwtToken unless
 * `sub` is a real mailto: address or an https: URL — "localhost" does not count.
 */
function validSubject(subject: string | undefined | null): boolean {
  if (!subject) return false;
  if (subject.startsWith("https://")) return !/localhost|127\.0\.0\.1/.test(subject);
  if (subject.startsWith("mailto:")) {
    const addr = subject.slice("mailto:".length).trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) && !addr.endsWith("@localhost");
  }
  return false;
}

function defaultSubject(): string {
  const mail = ALLOWED_GOOGLE_EMAILS[0];
  if (mail) return `mailto:${mail}`;
  const origin = publicOrigin();
  if (validSubject(origin)) return origin;
  return "mailto:kalender@example.com";
}

function pickSubject(candidate: string | undefined | null): string {
  const trimmed = candidate?.trim().replace(/^mailto:\s+/, "mailto:");
  return validSubject(trimmed) ? trimmed! : defaultSubject();
}

export async function loadVapidKeys(): Promise<VapidKeys> {
  if (cached) return cached;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const envSub = process.env.VAPID_SUBJECT?.trim();
  if (envPub && envPriv) {
    cached = {
      publicKey: envPub,
      privateKey: envPriv,
      subject: pickSubject(envSub),
    };
    webpush.setVapidDetails(cached.subject, cached.publicKey, cached.privateKey);
    return cached;
  }

  const { rows } = await query<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE key LIKE 'vapid_%'",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (map.vapid_public && map.vapid_private) {
    cached = {
      publicKey: map.vapid_public,
      privateKey: map.vapid_private,
      subject: pickSubject(map.vapid_subject),
    };
    webpush.setVapidDetails(cached.subject, cached.publicKey, cached.privateKey);
    console.log("VAPID-Schlüssel aus der Datenbank geladen.");
    return cached;
  }

  const generated = webpush.generateVAPIDKeys();
  const subject = defaultSubject();
  await query(
    `INSERT INTO app_settings (key, value) VALUES
       ('vapid_public', $1),
       ('vapid_private', $2),
       ('vapid_subject', $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [generated.publicKey, generated.privateKey, subject],
  );
  cached = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject,
  };
  webpush.setVapidDetails(cached.subject, cached.publicKey, cached.privateKey);
  console.log("VAPID-Schlüssel erzeugt und in der Datenbank gespeichert.");
  return cached;
}

export function getVapidPublicKey(): string {
  if (!cached) throw new Error("VAPID ist noch nicht initialisiert.");
  return cached.publicKey;
}
