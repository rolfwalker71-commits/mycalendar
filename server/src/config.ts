import "dotenv/config";

function requiredInProd(name: string, fallback = ""): string {
  const value = process.env[name] ?? fallback;
  return value;
}

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const APP_PORT = Number(process.env.APP_PORT ?? 3366);
export const TZ = process.env.TZ ?? "Europe/Berlin";
export const WEEK_START = Number(process.env.WEEK_START ?? 1) === 0 ? 0 : 1;

export const JWT_SECRET =
  requiredInProd("JWT_SECRET") || "dev-only-change-me-jwt-secret-please";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
export const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
export const COOKIE_NAME = "kalender_session";

export const APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY || JWT_SECRET;

export const DATABASE_URL = process.env.DATABASE_URL ?? "";

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://localhost:3366/api/auth/google/callback";

export const GEMINI_API_KEY = (process.env.GEMINI_API_KEY ?? "").trim();

export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

export function publicOrigin(): string {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  try {
    return new URL(GOOGLE_REDIRECT_URI).origin;
  } catch {
    return `http://localhost:${APP_PORT}`;
  }
}

export const ALLOWED_GOOGLE_EMAILS = (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isEmailAllowed(email: string): boolean {
  if (ALLOWED_GOOGLE_EMAILS.length === 0) {
    return NODE_ENV !== "production";
  }
  return ALLOWED_GOOGLE_EMAILS.includes(email.trim().toLowerCase());
}

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendars.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/tasks",
] as const;

export function googleConfigured(): boolean {
  return Boolean(
    GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET &&
      !GOOGLE_CLIENT_ID.startsWith("ihre-google") &&
      !GOOGLE_CLIENT_SECRET.startsWith("bitte-durch"),
  );
}
