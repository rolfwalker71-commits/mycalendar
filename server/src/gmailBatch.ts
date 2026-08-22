import type { UserRow } from "./types.js";
import { getAuthedOAuthClient } from "./google.js";
import { mapPool } from "./mailMime.js";

const BATCH_URLS = [
  "https://www.googleapis.com/batch/gmail/v1",
  "https://gmail.googleapis.com/batch/gmail/v1",
];

const MAX_PER_BATCH = 100;

export type GmailBatchPart = {
  id: string;
  path: string;
  method?: "GET";
};

async function accessTokenFor(user: UserRow): Promise<string> {
  const client = await getAuthedOAuthClient(user);
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Kein Gmail-Zugriffstoken.");
  return token.token;
}

function buildBatchBody(parts: GmailBatchPart[]): { body: string; boundary: string } {
  const boundary = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const chunks: string[] = [];
  parts.forEach((part, i) => {
    const method = part.method ?? "GET";
    chunks.push(
      `--${boundary}\r\n` +
        `Content-Type: application/http\r\n` +
        `Content-ID: <item-${i}>\r\n` +
        `\r\n` +
        `${method} ${part.path} HTTP/1.1\r\n` +
        `\r\n`,
    );
  });
  chunks.push(`--${boundary}--\r\n`);
  return { body: chunks.join(""), boundary };
}

function extractBoundary(contentType: string, raw: string): string {
  const quoted = /boundary="([^"]+)"/i.exec(contentType);
  if (quoted) return quoted[1];
  const plain = /boundary=([^;\s]+)/i.exec(contentType);
  if (plain) return plain[1];
  const first = /^--(\S+)/m.exec(raw);
  if (first) return first[1];
  throw new Error("Gmail-Batch-Antwort ohne Boundary.");
}

function splitMultipart(raw: string, boundary: string): string[] {
  const end = `--${boundary}--`;
  const cut = raw.includes(end) ? raw.slice(0, raw.indexOf(end)) : raw;
  return cut
    .split(`--${boundary}`)
    .map((p) => p.replace(/^\r?\n/, "").replace(/\r?\n$/, ""))
    .filter((p) => p.length > 0);
}

function indexOfBlankLine(s: string): number {
  const crlf = s.indexOf("\r\n\r\n");
  const lf = s.indexOf("\n\n");
  if (crlf >= 0 && (lf < 0 || crlf < lf)) return crlf;
  return lf;
}

function parseHttpPart<T>(part: string): { index: number | null; data: T | null } {
  const mimeEnd = indexOfBlankLine(part);
  const mimeHeaders = mimeEnd >= 0 ? part.slice(0, mimeEnd) : "";
  const httpRaw =
    mimeEnd >= 0 ? part.slice(mimeEnd).replace(/^(?:\r\n\r\n|\n\n)/, "") : part;

  let index: number | null = null;
  const cid = /Content-ID:\s*<?([^>\r\n]+)>?/i.exec(mimeHeaders);
  if (cid) {
    const n = /item-(\d+)/.exec(cid[1]);
    if (n) index = Number(n[1]);
  }

  const status = Number(/HTTP\/[\d.]+\s+(\d+)/.exec(httpRaw)?.[1] ?? 0);
  const httpEnd = indexOfBlankLine(httpRaw);
  const jsonText = (httpEnd >= 0 ? httpRaw.slice(httpEnd).replace(/^(?:\r\n\r\n|\n\n)/, "") : "")
    .trim();
  if (status < 200 || status >= 300 || !jsonText) return { index, data: null };
  try {
    return { index, data: JSON.parse(jsonText) as T };
  } catch {
    return { index, data: null };
  }
}

function parseBatchResponse<T>(raw: string, contentType: string, count: number): (T | null)[] {
  const boundary = extractBoundary(contentType, raw);
  const parts = splitMultipart(raw, boundary);
  const out: (T | null)[] = Array.from({ length: count }, () => null);
  let sequential = 0;
  for (const part of parts) {
    const parsed = parseHttpPart<T>(part);
    const idx = parsed.index ?? sequential;
    sequential += 1;
    if (idx >= 0 && idx < count) out[idx] = parsed.data;
  }
  return out;
}

async function executeBatch<T>(token: string, parts: GmailBatchPart[]): Promise<(T | null)[]> {
  const { body, boundary } = buildBatchBody(parts);
  let lastErr: Error | null = null;
  for (const url of BATCH_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) {
        lastErr = new Error(`Gmail-Batch ${res.status}`);
        continue;
      }
      const text = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      const parsed = parseBatchResponse<T>(text, ct, parts.length);
      if (parts.length && parsed.every((row) => row == null)) {
        lastErr = new Error("Gmail-Batch ohne verwertbare Teile.");
        continue;
      }
      return parsed;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error("Gmail-Batch fehlgeschlagen.");
}

export async function gmailBatchGet<T>(
  user: UserRow,
  parts: GmailBatchPart[],
  fallback: (id: string) => Promise<T | null>,
): Promise<(T | null)[]> {
  if (!parts.length) return [];
  let results: (T | null)[] | null = null;
  try {
    const token = await accessTokenFor(user);
    results = [];
    for (let i = 0; i < parts.length; i += MAX_PER_BATCH) {
      results.push(...(await executeBatch<T>(token, parts.slice(i, i + MAX_PER_BATCH))));
    }
  } catch (err) {
    console.warn(
      "Gmail-Batch fehlgeschlagen, parallel weiter:",
      err instanceof Error ? err.message : err,
    );
    return mapPool(parts, 20, (p) => fallback(p.id));
  }

  const missing = results
    .map((row, i) => (row == null ? i : -1))
    .filter((i) => i >= 0);
  if (missing.length) {
    const filled = await mapPool(missing, 20, async (i) => {
      try {
        return [i, await fallback(parts[i].id)] as const;
      } catch {
        return [i, null] as const;
      }
    });
    for (const [i, val] of filled) results[i] = val;
  }
  return results;
}
