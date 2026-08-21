import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { EventAttachmentJson } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

type ShiftArt = {
  id: string;
  code: string;
  name: string;
  file: string;
  email: string;
  googleEventIds: string[];
};

type CoverRef =
  | { kind: "shift"; file: string; version: string }
  | { kind: "drive"; fileId: string; mimeType?: string; version: string };

let artsCache: { mtime: number; arts: ShiftArt[] } | null = null;

export function invalidateShiftArtCache(): void {
  artsCache = null;
}

function schichtklarRoot(): string | null {
  const fromEnv = (process.env.SCHICHTKLAR_DIR ?? "").trim();
  const candidates = [
    fromEnv,
    resolve(here, "../shiftplanner"),
    resolve(here, "../../shiftplanner"),
    resolve(here, "../../../shiftplanner"),
  ].filter(Boolean);
  for (const root of candidates) {
    if (existsSync(join(root, "backend/data/schichtklar.db"))) return root;
  }
  return null;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function loadShiftArts(): ShiftArt[] {
  const root = schichtklarRoot();
  if (!root) return [];
  const dbPath = join(root, "backend/data/schichtklar.db");
  let mtime = 0;
  try {
    mtime = statSync(dbPath).mtimeMs;
  } catch {
    return [];
  }
  if (artsCache && artsCache.mtime === mtime) return artsCache.arts;

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const types = db
      .prepare(
        `SELECT t.id, t.code, t.name, t.imagePath, u.email
           FROM ShiftType t
           JOIN User u ON u.id = t.userId
          WHERE t.imagePath IS NOT NULL AND t.imagePath != ''`,
      )
      .all() as {
      id: string;
      code: string;
      name: string;
      imagePath: string;
      email: string;
    }[];
    const shifts = db
      .prepare(
        `SELECT googleEventId, shiftTypeId FROM Shift WHERE googleEventId IS NOT NULL AND googleEventId != ''`,
      )
      .all() as { googleEventId: string; shiftTypeId: string }[];
    const byType = new Map<string, string[]>();
    for (const s of shifts) {
      const list = byType.get(s.shiftTypeId) ?? [];
      list.push(s.googleEventId);
      byType.set(s.shiftTypeId, list);
    }
    const backend = join(root, "backend");
    const arts: ShiftArt[] = [];
    for (const t of types) {
      const rel = t.imagePath.replace(/^\//, "");
      const file = resolve(backend, rel);
      const illustrations = resolve(backend, "uploads/illustrations");
      if (!file.startsWith(illustrations) || !existsSync(file)) continue;
      arts.push({
        id: t.id,
        code: t.code,
        name: t.name,
        file,
        email: t.email,
        googleEventIds: byType.get(t.id) ?? [],
      });
    }
    arts.sort((a, b) => {
      const demo = Number(a.email.includes("demo")) - Number(b.email.includes("demo"));
      if (demo) return demo;
      return b.code.length - a.code.length;
    });
    artsCache = { mtime, arts };
    return arts;
  } finally {
    db.close();
  }
}

export function imageAttachment(attachments: EventAttachmentJson[] | null | undefined): EventAttachmentJson | null {
  if (!attachments?.length) return null;
  return (
    attachments.find((a) => {
      const mime = (a.mimeType ?? "").toLowerCase();
      if (mime.startsWith("image/") && !mime.includes("google-apps")) return true;
      if (mime.includes("google-apps")) return false;
      if (/\.(png|jpe?g|gif|webp)$/i.test(a.title ?? a.fileUrl ?? "")) return true;
      return Boolean(a.fileId) && !mime;
    }) ?? null
  );
}

function isShiftCalendar(summary?: string | null): boolean {
  const t = fold(summary ?? "");
  return /arbeitsplan|valentyna|schichtklar/.test(t);
}

function titleKey(summary?: string | null): string {
  return fold(summary ?? "").replace(/^[^\p{L}\p{N}]+/gu, "").trim();
}

function matchShiftArt(input: {
  googleEventId?: string | null;
  summary?: string | null;
  calendarSummary?: string | null;
}): ShiftArt | null {
  const arts = loadShiftArts();
  if (!arts.length) return null;
  const gid = input.googleEventId?.trim();
  if (gid) {
    const hit = arts.find((a) => a.googleEventIds.includes(gid));
    if (hit) return hit;
  }
  if (!isShiftCalendar(input.calendarSummary)) return null;
  const title = titleKey(input.summary);
  if (!title) return null;
  for (const art of arts) {
    const code = fold(art.code);
    if (!code) continue;
    if (title === code || title.startsWith(`${code} `) || title.startsWith(`${code}/`) || title.startsWith(`${code}·`)) {
      const named = arts.find(
        (a) => fold(a.code) === code && title.includes(fold(a.name)) && existsSync(a.file),
      );
      return named ?? art;
    }
  }
  return null;
}

function coverRef(input: {
  googleEventId?: string | null;
  summary?: string | null;
  calendarSummary?: string | null;
  attachments?: EventAttachmentJson[] | null;
}): CoverRef | null {
  const att = imageAttachment(input.attachments);
  if (att?.fileId) {
    return { kind: "drive", fileId: att.fileId, mimeType: att.mimeType, version: att.fileId };
  }
  const art = matchShiftArt(input);
  if (art) {
    let version = art.id;
    try {
      version = String(statSync(art.file).mtimeMs);
    } catch {
      /* keep id */
    }
    return { kind: "shift", file: art.file, version };
  }
  return null;
}

export function coverUrlFor(input: {
  id: string;
  google_event_id?: string | null;
  summary?: string | null;
  calendar_summary?: string | null;
  attachments?: EventAttachmentJson[] | null;
}): string | null {
  const ref = coverRef({
    googleEventId: input.google_event_id,
    summary: input.summary,
    calendarSummary: input.calendar_summary,
    attachments: input.attachments,
  });
  if (!ref) return null;
  return `/api/events/${input.id}/cover?v=${encodeURIComponent(ref.version)}`;
}

function coversDir(): string {
  const dir = resolve(here, "../data/covers");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function loadCoverFile(
  input: {
    googleEventId?: string | null;
    summary?: string | null;
    calendarSummary?: string | null;
    attachments?: EventAttachmentJson[] | null;
  },
  fetchDrive?: (fileId: string) => Promise<{ buffer: Buffer; mimeType: string } | null>,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const att = imageAttachment(input.attachments);
  if (att?.fileId && fetchDrive) {
    const cached = join(coversDir(), `${att.fileId.replace(/[^a-zA-Z0-9_-]/g, "")}.bin`);
    if (existsSync(cached)) {
      return { buffer: readFileSync(cached), mimeType: att.mimeType || "image/png" };
    }
    const got = await fetchDrive(att.fileId);
    if (got) {
      try {
        writeFileSync(cached, got.buffer);
      } catch {
        /* ignore cache write */
      }
      return got;
    }
  }
  const art = matchShiftArt(input);
  if (!art) return null;
  const mime = art.file.endsWith(".jpg") || art.file.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return { buffer: readFileSync(art.file), mimeType: mime };
}
