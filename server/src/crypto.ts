import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { APP_ENCRYPTION_KEY } from "./config.js";

const SALT = "kalender-aes-gcm-v1";

function key(): Buffer {
  return scryptSync(APP_ENCRYPTION_KEY, SALT, 32);
}

/** AES-256-GCM. Format: base64(iv 12 | tag 16 | ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) {
    throw new Error("Ungültiges Geheimnis");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
