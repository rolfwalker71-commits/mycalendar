import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import type { Auth, calendar_v3, drive_v3, gmail_v1, people_v1, tasks_v1 } from "googleapis";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from "./config.js";
import { decrypt } from "./crypto.js";
import { query } from "./db.js";
import type { UserRow } from "./types.js";

export type GoogleErrorCode =
  | "reauth"
  | "config"
  | "google"
  | "gmail_scope"
  | "contacts_scope"
  | "tasks_scope"
  | "calendar_scope"
  | "api_disabled";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: GoogleErrorCode = "google",
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

const tokenCache = new Map<string, { access_token: string; expiry_date: number }>();

async function getAuthedOAuthClient(
  user: UserRow,
): Promise<Auth.OAuth2Client> {
  if (!user.refresh_token_enc) {
    throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
  }
  const client = createOAuthClient();
  const cached = tokenCache.get(user.id);
  if (cached && cached.expiry_date > Date.now() + 60_000) {
    client.setCredentials({
      refresh_token: decrypt(user.refresh_token_enc),
      access_token: cached.access_token,
      expiry_date: cached.expiry_date,
    });
    return client;
  }
  client.setCredentials({ refresh_token: decrypt(user.refresh_token_enc) });
  try {
    const token = await client.getAccessToken();
    if (!token.token) {
      tokenCache.delete(user.id);
      throw new GoogleAuthError("Bitte erneut anmelden.", "reauth");
    }
    tokenCache.set(user.id, {
      access_token: token.token,
      expiry_date: client.credentials.expiry_date ?? Date.now() + 45 * 60 * 1000,
    });
  } catch (err) {
    tokenCache.delete(user.id);
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

export async function getAuthedPeople(user: UserRow): Promise<people_v1.People> {
  const client = await getAuthedOAuthClient(user);
  return google.people({ version: "v1", auth: client });
}

export async function getAuthedTasks(user: UserRow): Promise<tasks_v1.Tasks> {
  const client = await getAuthedOAuthClient(user);
  return google.tasks({ version: "v1", auth: client });
}

export async function getAuthedDrive(user: UserRow): Promise<drive_v3.Drive> {
  const client = await getAuthedOAuthClient(user);
  return google.drive({ version: "v3", auth: client });
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
      msg.includes("insufficient authentication scopes") ||
      msg.includes("request had insufficient authentication scopes"))
  );
}

export function isApiDisabled(err: unknown): boolean {
  const e = err as {
    errors?: { reason?: string }[];
    message?: string;
  };
  const reason = e.errors?.[0]?.reason ?? "";
  const msg = (e.message ?? "").toLowerCase();
  return (
    reason === "accessNotConfigured" ||
    reason === "SERVICE_DISABLED" ||
    msg.includes("has not been used") ||
    msg.includes("is disabled") ||
    msg.includes("api has not been enabled") ||
    msg.includes("access not configured")
  );
}

const API_DISABLED_HINT: Record<string, string> = {
  people:
    "Die People API ist im Google-Cloud-Projekt nicht aktiviert. In der Cloud Console unter „APIs & Dienste“ die People API einschalten, danach Google erneut verbinden.",
  tasks:
    "Die Google Tasks API ist im Google-Cloud-Projekt nicht aktiviert. In der Cloud Console unter „APIs & Dienste“ die Tasks API einschalten, danach Google erneut verbinden.",
  gmail:
    "Die Gmail API ist nicht vollständig freigegeben. In der Cloud Console die Gmail API aktivieren und Google erneut verbinden.",
  calendar:
    "Die Google Calendar API ist nicht vollständig freigegeben. In der Cloud Console die Calendar API aktivieren und Google erneut verbinden.",
  drive:
    "Die Google Drive API ist nicht aktiviert. In der Cloud Console die Drive API einschalten, danach Google erneut verbinden.",
};

const SCOPE_HINT: Record<string, { message: string; code: GoogleErrorCode }> = {
  people: {
    message: "Bitte Google erneut verbinden, um Kontakte freizugeben.",
    code: "contacts_scope",
  },
  tasks: {
    message: "Bitte Google erneut verbinden, um Aufgaben freizugeben.",
    code: "tasks_scope",
  },
  gmail: {
    message: "Bitte erneut anmelden, um Mail freizugeben.",
    code: "gmail_scope",
  },
  calendar: {
    message: "Bitte Google erneut verbinden, um den Kalender vollständig freizugeben.",
    code: "calendar_scope",
  },
  drive: {
    message: "Bitte Google erneut verbinden, um Drive-Anhänge zu laden.",
    code: "calendar_scope",
  },
};

export function describeGoogleApiError(
  err: unknown,
  api: "people" | "tasks" | "gmail" | "calendar" | "drive",
): { status: number; error: string; code: string } | null {
  if (err instanceof GoogleAuthError) {
    return { status: err.code === "reauth" ? 401 : 403, error: err.message, code: err.code };
  }
  if (isAuthError(err)) {
    return { status: 401, error: "Bitte erneut anmelden.", code: "reauth" };
  }
  if (isApiDisabled(err)) {
    return { status: 403, error: API_DISABLED_HINT[api], code: "api_disabled" };
  }
  if (isInsufficientScope(err)) {
    const hint = SCOPE_HINT[api];
    return { status: 403, error: hint.message, code: hint.code };
  }
  return null;
}

export function newWatchRequestId(): string {
  return randomUUID();
}
