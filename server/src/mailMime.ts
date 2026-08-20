import type { gmail_v1 } from "googleapis";

export type MailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
};

export type ParsedPart = {
  text: string;
  html: string;
  attachments: MailAttachment[];
};

function decodeBody(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

export function headerMap(
  headers?: gmail_v1.Schema$MessagePartHeader[] | null,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (!h.name || h.value == null) continue;
    const key = h.name.toLowerCase();
    map[key] = map[key] ? `${map[key]}, ${h.value}` : h.value;
  }
  return map;
}

function walk(part: gmail_v1.Schema$MessagePart | undefined, acc: ParsedPart): void {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  const filename = part.filename ?? "";
  if (part.body?.attachmentId && filename) {
    acc.attachments.push({
      filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
      attachmentId: part.body.attachmentId,
    });
  }
  if (part.body?.data && !part.body.attachmentId) {
    const decoded = decodeBody(part.body.data);
    if (mime.startsWith("text/plain") && !acc.text) acc.text = decoded;
    else if (mime.startsWith("text/html") && !acc.html) acc.html = decoded;
  }
  for (const child of part.parts ?? []) walk(child, acc);
}

export function parsePayload(payload?: gmail_v1.Schema$MessagePart | null): ParsedPart {
  const acc: ParsedPart = { text: "", html: "", attachments: [] };
  if (payload) walk(payload, acc);
  return acc;
}

export function scrubHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "");
}

export function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function buildRfc822(input: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
  ];
  if (input.cc?.length) lines.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc?.length) lines.push(`Bcc: ${input.bcc.join(", ")}`);
  lines.push(`Subject: ${encodeHeaderValue(input.subject || "(kein Betreff)")}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) lines.push(`References: ${input.references}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 8bit");
  lines.push("");
  lines.push(input.text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
  return lines.join("\r\n");
}

export function parseAddress(raw: string | undefined): { name: string; email: string } {
  const value = (raw ?? "").trim();
  const angle = value.match(/^(.*)<([^>]+)>\s*$/);
  if (angle) {
    return {
      name: angle[1].replace(/^"|"$/g, "").trim(),
      email: angle[2].trim(),
    };
  }
  if (value.includes("@")) return { name: "", email: value };
  return { name: value, email: "" };
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: items.length ? n : 0 }, () => worker()));
  return out;
}
