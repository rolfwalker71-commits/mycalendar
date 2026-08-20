import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { Auth, calendar_v3, gmail_v1 } from "googleapis";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from "./config.js";
import { decrypt } from "./crypto.js";
import { query } from "./db.js";
import type { UserRow } from "./types.js";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: "reauth" | "config" | "google" | "gmail_scope" = "google",
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function createOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
}

export function authUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...GOOGLE_SCOPES],
    state,
  });
}

async function getAuthedOAuthClient(
  user: UserRow,
): Promise<Auth.OAuth2Client> {
  if (!user.refresh_token_enc) {
    throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decrypt(user.refresh_token_enc) });
  try {
    const token = await client.getAccessToken();
    if (!token.token) {
      throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
    }
  } catch (err) {
    const status =
      (err as { status?: number; code?: number }).status ??
      (err as { code?: number }).code;
    if (status === 401 || status === 400) {
      await query("UPDATE users SET refresh_token_enc = NULL WHERE id = $1", [
        user.id,
      ]);
      throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
    }
    throw err;
  }
  return client;
}

export async function getAuthedCalendar(
  user: UserRow,
): Promise<calendar_v3.Calendar> {
  const client = await getAuthedOAuthClient(user);
  return google.calendar({ version: "v3", auth: client });
}

export async function getAuthedGmail(user: UserRow): Promise<gmail_v1.Gmail> {
  const client = await getAuthedOAuthClient(user);
  return google.gmail({ version: "v1", auth: client });
}

export function isGoneError(err: unknown): boolean {
  const e = err as { code?: number; status?: number };
  return e.code === 410 || e.status === 410;
}

export function isAuthError(err: unknown): boolean {
  const e = err as { code?: number; status?: number };
  return e.code === 401 || e.status === 401;
}

export function isInsufficientScope(err: unknown): boolean {
  const e = err as {
    code?: number;
    status?: number;
    errors?: { reason?: string }[];
    message?: string;
  };
  const status = e.code ?? e.status;
  const reason = e.errors?.[0]?.reason ?? "";
  const msg = (e.message ?? "").toLowerCase();
  return (
    status === 403 &&
    (reason === "insufficientPermissions" ||
      msg.includes("insufficient") ||
      msg.includes("access not granted") ||
      msg.includes("metadata scope") ||
      msg.includes("insufficient authentication scopes"))
  );
}

export function newWatchRequestId(): string {
  return randomUUID();
}
