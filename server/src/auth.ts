import type { CookieOptions, NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  COOKIE_NAME,
  COOKIE_SECURE,
  JWT_EXPIRES_IN,
  JWT_SECRET,
} from "./config.js";
import { query } from "./db.js";
import type { UserRow } from "./types.js";

const lastSeen = new Map<string, number>();

export function getLastSeen(): Map<string, number> {
  return lastSeen;
}

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function signToken(user: Pick<UserRow, "id" | "email">): string {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function setSessionCookie(res: Response, user: Pick<UserRow, "id" | "email">): void {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
  });
}

export async function loadUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export function getUserFromRequest(req: Request): { id: string; email: string } | null {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const session = getUserFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Bitte anmelden.", code: "unauthenticated" });
    return;
  }
  const user = await loadUserById(session.id);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Bitte erneut anmelden.", code: "reauth" });
    return;
  }
  lastSeen.set(user.id, Date.now());
  req.user = user;
  next();
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}
