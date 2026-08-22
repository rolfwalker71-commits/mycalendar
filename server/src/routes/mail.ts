import { Router } from "express";
import { Readable } from "node:stream";
import type { Request } from "express";
import type { gmail_v1 } from "googleapis";
import { requireAuth } from "../auth.js";
import { query } from "../db.js";
import { TZ } from "../config.js";
import {
  GoogleAuthError,
  describeGoogleApiError,
  getAuthedCalendar,
  getAuthedDrive,
  getAuthedGmail,
  getAuthedPeople,
  isInsufficientScope,
} from "../google.js";
import { extractEventFromText, parseIcs } from "../icsParse.js";
import { eventToGoogleBody, refreshCachedEvent } from "../sync.js";
import type { CalendarRow, UserRow } from "../types.js";
import {
  buildRfc822,
  headerMap,
  htmlToPlain,
  mapPool,
  parseAddress,
  parsePayload,
  scrubHtml,
  type OutgoingAttachment,
} from "../mailMime.js";
import { gravatarUrl } from "../mailAvatar.js";
import { extractHighlightCards } from "../mailCards.js";

export const mailRouter = Router();
mailRouter.use(requireAuth);

const SYSTEM_LABELS: { id: string; name: string; order: number }[] = [
  { id: "INBOX", name: "Posteingang", order: 0 },
  { id: "STARRED", name: "Markiert", order: 1 },
  { id: "DRAFT", name: "Entwürfe", order: 2 },
  { id: "SENT", name: "Gesendet", order: 3 },
  { id: "SPAM", name: "Spam", order: 4 },
  { id: "TRASH", name: "Papierkorb", order: 5 },
];

const MAX_ATTACH_BYTES = 20 * 1024 * 1024;

const GMAIL_LABEL_COLORS = new Set([
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
  "#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3",
  "#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#d0bcf1", "#fbc8d9",
  "#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#e66550", "#ffbc6b",
  "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b99aff", "#f7a7c0", "#cc3a21", "#eaa041",
  "#f2c960", "#149e60", "#2dae75", "#3c78d8", "#8e63ce", "#e07798", "#ac2b16", "#cf8933",
  "#d5ae49", "#0b804b", "#285bac", "#653e9b", "#b65775", "#822111", "#a46a21", "#aa8831",
  "#076239", "#1c4587", "#41236d", "#83334c", "#711a36", "#8a1c0a", "#7a2e0e", "#594c05",
  "#0b4f30", "#04502e", "#0d3472", "#b6cff5", "#98d7e4", "#e3d7ff", "#fbd3e0", "#f2b2a8",
  "#ffc8af", "#ffdeb5", "#fbe983", "#fdedc1", "#b3efd3", "#a2dcc1", "#048ae5", "#0066da",
  "#3d188e", "#0d3b44", "#464646", "#e7e7e7", "#2da2bb", "#009688",
]);

function handleMailError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  const described = describeGoogleApiError(err, "gmail");
  if (described) {
    res.status(described.status).json({ error: described.error, code: described.code });
    return true;
  }
  if (err instanceof GoogleAuthError) {
    res.status(err.code === "gmail_scope" ? 403 : 401).json({
      error: err.message,
      code: err.code,
    });
    return true;
  }
  if (isInsufficientScope(err)) {
    res.status(403).json({
      error: "Bitte erneut anmelden, um Mail freizugeben.",
      code: "gmail_scope",
    });
    return true;
  }
  return false;
}

function parseRecipients(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseOutgoingAttachments(raw: unknown): { attachments: OutgoingAttachment[]; error?: string } {
  if (!Array.isArray(raw) || !raw.length) return { attachments: [] };
  const out: OutgoingAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const filename = typeof rec.filename === "string" ? rec.filename : "anhang";
    const mimeType = typeof rec.mimeType === "string" ? rec.mimeType : "application/octet-stream";
    let dataB64 = typeof rec.data === "string" ? rec.data : "";
    const comma = dataB64.indexOf("base64,");
    if (comma >= 0) dataB64 = dataB64.slice(comma + 7);
    if (!dataB64) continue;
    const data = Buffer.from(dataB64, "base64");
    total += data.length;
    if (total > MAX_ATTACH_BYTES) {
      return { attachments: [], error: "Der Anhang ist zu groß (max. 20 MB)." };
    }
    out.push({ filename, mimeType, data });
  }
  return { attachments: out };
}

async function collectForwardAttachments(
  gmail: Awaited<ReturnType<typeof gmailFor>>,
  raw: unknown,
  existing: OutgoingAttachment[],
): Promise<{ attachments: OutgoingAttachment[]; error?: string }> {
  if (!Array.isArray(raw) || !raw.length) return { attachments: existing };
  const out = [...existing];
  let total = out.reduce((n, a) => n + a.data.length, 0);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const messageId = typeof rec.messageId === "string" ? rec.messageId : "";
    const attachmentId = typeof rec.attachmentId === "string" ? rec.attachmentId : "";
    if (!messageId || !attachmentId) continue;
    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const buf = Buffer.from((data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
    total += buf.length;
    if (total > MAX_ATTACH_BYTES) {
      return { attachments: [], error: "Der Anhang ist zu groß (max. 20 MB)." };
    }
    out.push({
      filename: typeof rec.filename === "string" ? rec.filename : "anhang",
      mimeType: typeof rec.mimeType === "string" ? rec.mimeType : "application/octet-stream",
      data: buf,
    });
  }
  return { attachments: out };
}

type ComposeBody = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  from?: string;
};

function readComposeBody(reqBody: Record<string, unknown>): ComposeBody {
  const html = typeof reqBody.html === "string" ? reqBody.html : "";
  const text =
    typeof reqBody.text === "string" && reqBody.text.trim()
      ? reqBody.text
      : html
        ? htmlToPlain(html)
        : "";
  return {
    to: parseRecipients(reqBody.to),
    cc: parseRecipients(reqBody.cc),
    bcc: parseRecipients(reqBody.bcc),
    subject: typeof reqBody.subject === "string" ? reqBody.subject : "",
    text,
    html,
    threadId: typeof reqBody.threadId === "string" ? reqBody.threadId : undefined,
    inReplyTo: typeof reqBody.inReplyTo === "string" ? reqBody.inReplyTo : undefined,
    references: typeof reqBody.references === "string" ? reqBody.references : undefined,
    from: typeof reqBody.from === "string" ? reqBody.from : undefined,
  };
}

async function gmailFor(req: Request) {
  return getAuthedGmail(req.user!);
}

type LabelCounts = {
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
};

function countsFrom(label?: gmail_v1.Schema$Label | null): LabelCounts {
  return {
    messagesTotal: label?.messagesTotal ?? 0,
    messagesUnread: label?.messagesUnread ?? 0,
    threadsTotal: label?.threadsTotal ?? 0,
    threadsUnread: label?.threadsUnread ?? 0,
  };
}

async function fetchLabelCounts(
  gmail: Awaited<ReturnType<typeof gmailFor>>,
  ids: string[],
): Promise<Map<string, LabelCounts>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows = await mapPool(unique, 8, async (id) => {
    try {
      const { data } = await gmail.users.labels.get({ userId: "me", id });
      return [id, countsFrom(data)] as const;
    } catch {
      return [id, countsFrom(null)] as const;
    }
  });
  return new Map(rows);
}

mailRouter.get("/labels", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.labels.list({ userId: "me" });
    const listed = data.labels ?? [];
    const userRaw = listed.filter((l) => l.type === "user" && l.id && l.name);
    const counts = await fetchLabelCounts(gmail, [
      ...SYSTEM_LABELS.map((s) => s.id),
      ...userRaw.map((l) => l.id as string),
    ]);
    const system = SYSTEM_LABELS.map((s) => ({
      id: s.id,
      name: s.name,
      type: "system" as const,
      color: null as { backgroundColor: string; textColor: string } | null,
      ...countsFrom(null),
      ...(counts.get(s.id) ?? {}),
    }));
    const user = userRaw
      .map((l) => ({
        id: l.id as string,
        name: l.name as string,
        type: "user" as const,
        color: l.color?.backgroundColor
          ? {
              backgroundColor: l.color.backgroundColor,
              textColor: l.color.textColor ?? "#000000",
            }
          : null,
        ...countsFrom(null),
        ...(counts.get(l.id as string) ?? {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    res.json({ labels: [...system, ...user] });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Postfächer konnten nicht geladen werden." });
  }
});

function summarizeMessage(message: gmail_v1.Schema$Message) {
  const headers = headerMap(message.payload?.headers);
  const from = parseAddress(headers.from);
  const to = parseAddress(headers.to);
  const labels = message.labelIds ?? [];
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: { ...from, avatarUrl: gravatarUrl(from.email) },
    to,
    subject: headers.subject ?? "",
    date: headers.date ?? "",
    snippet: message.snippet ?? "",
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    draft: labels.includes("DRAFT"),
    labelIds: labels,
    internalDate: message.internalDate ?? null,
  };
}

function mapFullMessage(
  message: gmail_v1.Schema$Message,
  threadId: string,
) {
  const headers = headerMap(message.payload?.headers);
  const parsed = parsePayload(message.payload);
  const from = parseAddress(headers.from);
  const labels = message.labelIds ?? [];
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? threadId,
    from: { ...from, avatarUrl: gravatarUrl(from.email) },
    to: headers.to ?? "",
    cc: headers.cc ?? "",
    bcc: headers.bcc ?? "",
    subject: headers.subject ?? "",
    date: headers.date ?? "",
    messageId: headers["message-id"] ?? "",
    references: headers.references ?? "",
    snippet: message.snippet ?? "",
    text: parsed.text,
    html: parsed.html ? scrubHtml(parsed.html) : "",
    attachments: parsed.attachments.map((a) => ({
      ...a,
      messageId: message.id ?? "",
    })),
    unread: labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    labelIds: labels,
    internalDate: message.internalDate ?? null,
    cards: extractHighlightCards(parsed.html),
  };
}

async function draftIdMap(gmail: Awaited<ReturnType<typeof gmailFor>>) {
  const map = new Map<string, string>();
  try {
    const { data } = await gmail.users.drafts.list({ userId: "me", maxResults: 100 });
    for (const d of data.drafts ?? []) {
      if (d.id && d.message?.threadId) map.set(d.message.threadId, d.id);
      if (d.id && d.message?.id) map.set(`msg:${d.message.id}`, d.id);
    }
  } catch {
    /* Entwürfe optional */
  }
  return map;
}

async function summarizeListedThread(
  gmail: Awaited<ReturnType<typeof gmailFor>>,
  threadId: string,
  listSnippet?: string | null,
  drafts?: Map<string, string>,
) {
  const { data } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "minimal",
  });
  const messages = data.messages ?? [];
  const lastMeta = messages[messages.length - 1];
  const lastId = lastMeta?.id ?? "";
  const last = lastId
    ? (
        await gmail.users.messages.get({
          userId: "me",
          id: lastId,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        })
      ).data
    : {};
  const summary = summarizeMessage(last);
  const unread = messages.some((m) => (m.labelIds ?? []).includes("UNREAD"));
  const starred = messages.some((m) => (m.labelIds ?? []).includes("STARRED"));
  const id = data.id ?? threadId;
  return {
    ...summary,
    id,
    snippet: listSnippet || data.snippet || summary.snippet,
    messageCount: messages.length,
    unread,
    starred,
    draftId: drafts?.get(id) ?? null,
    labelIds: last.labelIds ?? summary.labelIds,
  };
}

mailRouter.get("/threads", async (req, res) => {
  const labelId = String(req.query.labelId ?? "INBOX");
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
  const maxResults = Math.min(50, Math.max(10, Number(req.query.maxResults ?? 20) || 20));
  try {
    const gmail = await gmailFor(req);
    const listP = gmail.users.threads.list({
      userId: "me",
      labelIds: q ? undefined : labelId ? [labelId] : undefined,
      q: q || undefined,
      pageToken,
      maxResults,
    });
    const draftsP = labelId === "DRAFT" ? draftIdMap(gmail) : Promise.resolve(new Map<string, string>());
    const [list, drafts] = await Promise.all([listP, draftsP]);
    const threads = await mapPool(list.data.threads ?? [], 12, async (t) =>
      summarizeListedThread(gmail, t.id ?? "", t.snippet, drafts),
    );
    res.json({
      threads,
      nextPageToken: list.data.nextPageToken ?? null,
      resultSizeEstimate: list.data.resultSizeEstimate ?? threads.length,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Nachrichten konnten nicht geladen werden." });
  }
});

mailRouter.get("/threads/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.threads.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });
    const messages = (data.messages ?? []).map((message) =>
      mapFullMessage(message, data.id ?? req.params.id),
    );
    const drafts = await draftIdMap(gmail);
    const draftId = drafts.get(data.id ?? req.params.id) ?? null;
    const invites = await collectInvites(gmail, messages);
    const hint = extractEventFromText(
      messages[0]?.subject ?? "",
      messages.map((m) => m.text || m.snippet).join("\n"),
    );
    res.json({
      id: data.id ?? req.params.id,
      messages,
      unread: messages.some((m) => m.unread),
      starred: messages.some((m) => m.starred),
      draft: messages.some((m) => (m.labelIds ?? []).includes("DRAFT")),
      draftId,
      invites,
      eventHint: hint,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Nachricht konnte nicht geöffnet werden." });
  }
});

mailRouter.post("/threads/:id/modify", async (req, res) => {
  const addLabelIds = Array.isArray(req.body?.addLabelIds)
    ? req.body.addLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  const removeLabelIds = Array.isArray(req.body?.removeLabelIds)
    ? req.body.removeLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  try {
    const gmail = await gmailFor(req);
    await gmail.users.threads.modify({
      userId: "me",
      id: req.params.id,
      requestBody: { addLabelIds, removeLabelIds },
    });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Änderung fehlgeschlagen." });
  }
});

mailRouter.post("/threads/:id/trash", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.threads.trash({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Löschen fehlgeschlagen." });
  }
});

mailRouter.post("/threads/:id/untrash", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.threads.untrash({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Wiederherstellen fehlgeschlagen." });
  }
});

mailRouter.get("/messages", async (req, res) => {
  const labelId = String(req.query.labelId ?? "INBOX");
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
  const maxResults = Math.min(50, Math.max(10, Number(req.query.maxResults ?? 20) || 20));
  try {
    const gmail = await gmailFor(req);
    const listP = gmail.users.messages.list({
      userId: "me",
      labelIds: q ? undefined : labelId ? [labelId] : undefined,
      q: q || undefined,
      pageToken,
      maxResults,
    });
    const draftsP = labelId === "DRAFT" ? draftIdMap(gmail) : Promise.resolve(new Map<string, string>());
    const [list, drafts] = await Promise.all([listP, draftsP]);
    const threads = await mapPool(list.data.messages ?? [], 12, async (m) => {
      const { data } = await gmail.users.messages.get({
        userId: "me",
        id: m.id ?? "",
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const summary = summarizeMessage(data);
      const id = data.id ?? m.id ?? "";
      return {
        ...summary,
        id,
        snippet: data.snippet ?? summary.snippet,
        messageCount: 1,
        draftId: drafts.get(data.threadId ?? "") ?? drafts.get(`msg:${id}`) ?? null,
      };
    });
    res.json({
      threads,
      nextPageToken: list.data.nextPageToken ?? null,
      resultSizeEstimate: list.data.resultSizeEstimate ?? threads.length,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Nachrichten konnten nicht geladen werden." });
  }
});

mailRouter.get("/messages/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.messages.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });
    const mapped = mapFullMessage(data, data.threadId ?? req.params.id);
    const drafts = await draftIdMap(gmail);
    const invites = await collectInvites(gmail, [mapped]);
    const hint = extractEventFromText(mapped.subject, mapped.text || mapped.snippet);
    res.json({
      id: mapped.id,
      messages: [mapped],
      unread: mapped.unread,
      starred: mapped.starred,
      draft: (mapped.labelIds ?? []).includes("DRAFT"),
      draftId: drafts.get(data.threadId ?? "") ?? drafts.get(`msg:${mapped.id}`) ?? null,
      invites,
      eventHint: hint,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Nachricht konnte nicht geöffnet werden." });
  }
});

mailRouter.post("/messages/:id/modify", async (req, res) => {
  const addLabelIds = Array.isArray(req.body?.addLabelIds)
    ? req.body.addLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  const removeLabelIds = Array.isArray(req.body?.removeLabelIds)
    ? req.body.removeLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  try {
    const gmail = await gmailFor(req);
    await gmail.users.messages.modify({
      userId: "me",
      id: req.params.id,
      requestBody: { addLabelIds, removeLabelIds },
    });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Änderung fehlgeschlagen." });
  }
});

mailRouter.post("/messages/:id/trash", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.messages.trash({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Löschen fehlgeschlagen." });
  }
});

mailRouter.post("/messages/:id/untrash", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.messages.untrash({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Wiederherstellen fehlgeschlagen." });
  }
});

mailRouter.post("/send", async (req, res) => {
  const body = readComposeBody(req.body ?? {});
  if (!body.to.length) {
    res.status(400).json({ error: "Empfänger fehlt." });
    return;
  }
  try {
    const gmail = await gmailFor(req);
    const parsedAtt = parseOutgoingAttachments(req.body?.attachments);
    if (parsedAtt.error) {
      res.status(400).json({ error: parsedAtt.error });
      return;
    }
    const forwarded = await collectForwardAttachments(
      gmail,
      req.body?.forwardAttachments,
      parsedAtt.attachments,
    );
    if (forwarded.error) {
      res.status(400).json({ error: forwarded.error });
      return;
    }
    const from = body.from?.trim() || req.user!.email;
    const raw = buildRfc822({
      from,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments: forwarded.attachments,
    });
    const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
    if (draftId) {
      await gmail.users.drafts.update({
        userId: "me",
        id: draftId,
        requestBody: {
          message: {
            raw: Buffer.from(raw).toString("base64url"),
            threadId: body.threadId,
          },
        },
      });
      const { data } = await gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: draftId },
      });
      res.json({ ok: true, id: data.id, threadId: data.threadId });
      return;
    }
    const { data } = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: Buffer.from(raw).toString("base64url"),
        threadId: body.threadId,
      },
    });
    res.json({ ok: true, id: data.id, threadId: data.threadId });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Senden fehlgeschlagen." });
  }
});

mailRouter.get("/messages/:messageId/attachments/:attachmentId", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: req.params.messageId,
      id: req.params.attachmentId,
    });
    const filename = typeof req.query.filename === "string" ? req.query.filename : "anhang";
    const mime = typeof req.query.mime === "string" ? req.query.mime : "application/octet-stream";
    const buf = Buffer.from((data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buf);
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Anhang konnte nicht geladen werden." });
  }
});

mailRouter.post("/labels", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Name fehlt." });
    return;
  }
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    res.status(201).json({
      id: data.id,
      name: data.name,
      type: "user",
      color: data.color
        ? { backgroundColor: data.color.backgroundColor, textColor: data.color.textColor }
        : null,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Ordner konnte nicht angelegt werden." });
  }
});

mailRouter.patch("/labels/:id", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const backgroundColor =
    typeof req.body?.backgroundColor === "string" ? req.body.backgroundColor : "";
  const textColor = typeof req.body?.textColor === "string" ? req.body.textColor : "#000000";
  const requestBody: gmail_v1.Schema$Label = {};
  if (name) requestBody.name = name;
  if (backgroundColor) {
    if (!GMAIL_LABEL_COLORS.has(backgroundColor) || !GMAIL_LABEL_COLORS.has(textColor)) {
      res.status(400).json({ error: "Diese Farbe wird von Gmail nicht unterstützt." });
      return;
    }
    requestBody.color = { backgroundColor, textColor };
  }
  if (!requestBody.name && !requestBody.color) {
    res.status(400).json({ error: "Keine Änderung." });
    return;
  }
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.labels.patch({
      userId: "me",
      id: req.params.id,
      requestBody,
    });
    res.json({
      id: data.id,
      name: data.name,
      color: data.color
        ? { backgroundColor: data.color.backgroundColor, textColor: data.color.textColor }
        : null,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Ordner konnte nicht gespeichert werden." });
  }
});

mailRouter.delete("/labels/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.labels.delete({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Ordner konnte nicht gelöscht werden." });
  }
});

function mapDraftMessage(message: gmail_v1.Schema$Message) {
  const mapped = mapFullMessage(message, message.threadId ?? "");
  return mapped;
}

mailRouter.get("/drafts/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.drafts.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });
    const message = data.message ? mapDraftMessage(data.message) : null;
    res.json({
      id: data.id,
      message,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Entwurf konnte nicht geladen werden." });
  }
});

mailRouter.post("/drafts", async (req, res) => {
  const body = readComposeBody(req.body ?? {});
  const draftId = typeof req.body?.draftId === "string" ? req.body.draftId : "";
  try {
    const gmail = await gmailFor(req);
    const parsedAtt = parseOutgoingAttachments(req.body?.attachments);
    if (parsedAtt.error) {
      res.status(400).json({ error: parsedAtt.error });
      return;
    }
    const forwarded = await collectForwardAttachments(
      gmail,
      req.body?.forwardAttachments,
      parsedAtt.attachments,
    );
    if (forwarded.error) {
      res.status(400).json({ error: forwarded.error });
      return;
    }
    const raw = buildRfc822({
      from: body.from?.trim() || req.user!.email,
      to: body.to.length ? body.to : [req.user!.email],
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments: forwarded.attachments,
    });
    const requestBody = {
      message: {
        raw: Buffer.from(raw).toString("base64url"),
        threadId: body.threadId,
      },
    };
    const { data } = draftId
      ? await gmail.users.drafts.update({
          userId: "me",
          id: draftId,
          requestBody,
        })
      : await gmail.users.drafts.create({
          userId: "me",
          requestBody,
        });
    res.json({ ok: true, id: data.id, threadId: data.message?.threadId ?? body.threadId });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Entwurf konnte nicht gespeichert werden." });
  }
});

mailRouter.delete("/drafts/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.drafts.delete({ userId: "me", id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Entwurf konnte nicht verworfen werden." });
  }
});

mailRouter.get("/send-as", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.sendAs.list({ userId: "me" });
    const aliases = (data.sendAs ?? [])
      .filter((s) => s.sendAsEmail && s.verificationStatus !== "pending")
      .map((s) => ({
        sendAsEmail: s.sendAsEmail as string,
        displayName: s.displayName ?? "",
        isDefault: Boolean(s.isDefault),
        isPrimary: Boolean(s.isPrimary),
        signature: s.signature ?? "",
        treatAsAlias: Boolean(s.treatAsAlias),
      }));
    res.json({ aliases });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Absenderadressen konnten nicht geladen werden." });
  }
});

mailRouter.put("/send-as/:email/signature", async (req, res) => {
  const signature = typeof req.body?.signature === "string" ? req.body.signature : "";
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.sendAs.patch({
      userId: "me",
      sendAsEmail: req.params.email,
      requestBody: { signature },
    });
    res.json({ ok: true, signature: data.signature ?? "" });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Signatur konnte nicht gespeichert werden." });
  }
});

mailRouter.get("/vacation", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.getVacation({ userId: "me" });
    res.json({
      enableAutoReply: Boolean(data.enableAutoReply),
      responseSubject: data.responseSubject ?? "",
      responseBodyHtml: data.responseBodyHtml ?? "",
      responseBodyPlainText: data.responseBodyPlainText ?? "",
      restrictToContacts: Boolean(data.restrictToContacts),
      restrictToDomain: Boolean(data.restrictToDomain),
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Abwesenheitsnotiz konnte nicht geladen werden." });
  }
});

mailRouter.put("/vacation", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.updateVacation({
      userId: "me",
      requestBody: {
        enableAutoReply: Boolean(req.body?.enableAutoReply),
        responseSubject: typeof req.body?.responseSubject === "string" ? req.body.responseSubject : "",
        responseBodyHtml:
          typeof req.body?.responseBodyHtml === "string" ? req.body.responseBodyHtml : undefined,
        responseBodyPlainText:
          typeof req.body?.responseBodyPlainText === "string"
            ? req.body.responseBodyPlainText
            : undefined,
        restrictToContacts: Boolean(req.body?.restrictToContacts),
        restrictToDomain: Boolean(req.body?.restrictToDomain),
        startTime: typeof req.body?.startTime === "string" ? req.body.startTime : undefined,
        endTime: typeof req.body?.endTime === "string" ? req.body.endTime : undefined,
      },
    });
    res.json({
      enableAutoReply: Boolean(data.enableAutoReply),
      responseSubject: data.responseSubject ?? "",
      responseBodyHtml: data.responseBodyHtml ?? "",
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Abwesenheitsnotiz konnte nicht gespeichert werden." });
  }
});

mailRouter.get("/filters", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.filters.list({ userId: "me" });
    res.json({
      filters: (data.filter ?? []).map((f) => ({
        id: f.id,
        criteria: f.criteria ?? {},
        action: f.action ?? {},
      })),
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Filter konnten nicht geladen werden." });
  }
});

mailRouter.post("/filters", async (req, res) => {
  const from = typeof req.body?.from === "string" ? req.body.from : "";
  const query = typeof req.body?.query === "string" ? req.body.query : "";
  const addLabelIds = Array.isArray(req.body?.addLabelIds)
    ? req.body.addLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  const removeLabelIds = Array.isArray(req.body?.removeLabelIds)
    ? req.body.removeLabelIds.filter((x: unknown) => typeof x === "string")
    : [];
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: {
          from: from || undefined,
          query: query || undefined,
        },
        action: {
          addLabelIds: addLabelIds.length ? addLabelIds : undefined,
          removeLabelIds: removeLabelIds.length ? removeLabelIds : undefined,
        },
      },
    });
    res.status(201).json({
      filter: {
        id: data.id,
        criteria: data.criteria ?? {},
        action: data.action ?? {},
      },
    });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Filter konnte nicht erstellt werden." });
  }
});

mailRouter.delete("/filters/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    await gmail.users.settings.filters.delete({
      userId: "me",
      id: req.params.id,
    });
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Filter konnte nicht gelöscht werden." });
  }
});

mailRouter.get("/contacts", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 1) {
    res.json({ contacts: [] });
    return;
  }
  try {
    const people = await getAuthedPeople(req.user!);
    const [contacts, others] = await Promise.all([
      people.people.searchContacts({
        query: q,
        readMask: "names,emailAddresses",
        pageSize: 15,
      }),
      people.otherContacts.search({
        query: q,
        readMask: "names,emailAddresses",
        pageSize: 10,
      }).catch(() => ({ data: { results: [] as { person?: { names?: { displayName?: string | null }[]; emailAddresses?: { value?: string | null }[] } }[] } })),
    ]);
    const seen = new Set<string>();
    const out: { name: string; email: string }[] = [];
    const push = (name?: string | null, email?: string | null) => {
      const addr = (email ?? "").trim().toLowerCase();
      if (!addr || seen.has(addr)) return;
      seen.add(addr);
      out.push({ name: (name ?? "").trim(), email: addr });
    };
    for (const p of contacts.data.results ?? []) {
      const person = p.person;
      const name = person?.names?.[0]?.displayName;
      for (const em of person?.emailAddresses ?? []) push(name, em.value);
    }
    for (const p of others.data.results ?? []) {
      const person = p.person;
      const name = person?.names?.[0]?.displayName;
      for (const em of person?.emailAddresses ?? []) push(name, em.value);
    }
    res.json({ contacts: out.slice(0, 20) });
  } catch (err) {
    const described = describeGoogleApiError(err, "people");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code, contacts: [] });
      return;
    }
    console.error(err);
    res.status(502).json({ error: "Kontakte konnten nicht geladen werden.", contacts: [] });
  }
});

function isCalendarAttachment(att: { filename: string; mimeType: string }): boolean {
  return /calendar|ics/i.test(att.mimeType) || /\.ics$/i.test(att.filename);
}

async function gmailAttachmentBuffer(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const { data } = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  return Buffer.from((data.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function collectInvites(
  gmail: gmail_v1.Gmail,
  messages: Array<{ attachments: { filename: string; mimeType: string; attachmentId: string; messageId: string }[] }>,
) {
  const invites: {
    messageId: string;
    attachmentId: string;
    filename: string;
    method?: string;
    events: ReturnType<typeof parseIcs>["events"];
  }[] = [];
  for (const message of messages) {
    for (const att of message.attachments) {
      if (!isCalendarAttachment(att)) continue;
      try {
        const buf = await gmailAttachmentBuffer(gmail, att.messageId, att.attachmentId);
        const parsed = parseIcs(buf.toString("utf8"));
        if (parsed.events.length) {
          invites.push({
            messageId: att.messageId,
            attachmentId: att.attachmentId,
            filename: att.filename,
            method: parsed.method,
            events: parsed.events,
          });
        }
      } catch {
        /* skip */
      }
    }
  }
  return invites;
}

async function primaryWritableCalendar(userId: string): Promise<CalendarRow | null> {
  const { rows } = await query<CalendarRow>(
    `SELECT * FROM calendars
      WHERE user_id = $1
        AND google_cal_id NOT LIKE 'ics:%'
        AND google_cal_id NOT LIKE 'birthday:%'
      ORDER BY primary_cal DESC, selected DESC, summary ASC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function insertParsedEvent(
  user: UserRow,
  parsed: ReturnType<typeof parseIcs>["events"][number],
) {
  const calendar = await primaryWritableCalendar(user.id);
  if (!calendar) throw new Error("Kein Kalender.");
  const api = await getAuthedCalendar(user);
  const created = await api.events.insert({
    calendarId: calendar.google_cal_id,
    requestBody: eventToGoogleBody({
      summary: parsed.summary,
      description: parsed.description,
      location: parsed.location,
      allDay: parsed.allDay,
      start: parsed.start,
      end: parsed.end,
      timezone: parsed.timezone || calendar.timezone || TZ,
      attendees: parsed.attendees,
      recurrence: parsed.recurrence,
    }),
    supportsAttachments: true,
    conferenceDataVersion: 1,
  });
  if (created.data.id) await refreshCachedEvent(user, calendar, created.data.id);
  return created.data.id ?? null;
}

mailRouter.post("/messages/:messageId/attachments/:attachmentId/drive", async (req, res) => {
  const filename = typeof req.query.filename === "string" ? req.query.filename : "Anhang";
  const mime = typeof req.query.mime === "string" ? req.query.mime : "application/octet-stream";
  try {
    const gmail = await gmailFor(req);
    const buf = await gmailAttachmentBuffer(gmail, req.params.messageId, req.params.attachmentId);
    const drive = await getAuthedDrive(req.user!);
    const created = await drive.files.create({
      requestBody: { name: filename, mimeType: mime },
      media: { mimeType: mime, body: Readable.from(buf) },
      fields: "id,name,webViewLink",
    });
    res.json({
      ok: true,
      fileId: created.data.id,
      name: created.data.name,
      url: created.data.webViewLink,
    });
  } catch (err) {
    const described = describeGoogleApiError(err, "drive");
    if (described) {
      res.status(described.status).json({ error: described.error, code: described.code });
      return;
    }
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Anhang konnte nicht in Drive gelegt werden." });
  }
});

mailRouter.post("/to-event", async (req, res) => {
  try {
    const messageId = typeof req.body?.messageId === "string" ? req.body.messageId : "";
    const attachmentId = typeof req.body?.attachmentId === "string" ? req.body.attachmentId : "";
    if (messageId && attachmentId) {
      const gmail = await gmailFor(req);
      const buf = await gmailAttachmentBuffer(gmail, messageId, attachmentId);
      const parsed = parseIcs(buf.toString("utf8"));
      const ev = parsed.events[0];
      if (!ev) {
        res.status(400).json({ error: "Keine Termine in der Einladung." });
        return;
      }
      const googleEventId = await insertParsedEvent(req.user!, ev);
      res.json({ ok: true, googleEventId });
      return;
    }
    const hint = req.body?.event as
      | { summary?: string; start?: string; end?: string; allDay?: boolean; location?: string; description?: string }
      | undefined;
    if (!hint?.summary || !hint.start || !hint.end) {
      res.status(400).json({ error: "Kein Termin erkennbar." });
      return;
    }
    const googleEventId = await insertParsedEvent(req.user!, {
      uid: "mail-hint",
      summary: hint.summary,
      start: hint.start,
      end: hint.end,
      allDay: Boolean(hint.allDay),
      location: hint.location,
      description: hint.description,
    });
    res.json({ ok: true, googleEventId });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Termin konnte nicht angelegt werden." });
  }
});

mailRouter.post("/block", async (req, res) => {
  const from = typeof req.body?.from === "string" ? req.body.from.trim() : "";
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : "";
  if (!from) {
    res.status(400).json({ error: "Absender fehlt." });
    return;
  }
  try {
    const gmail = await gmailFor(req);
    await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: { from },
        action: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] },
      },
    });
    if (threadId) {
      await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    if (handleMailError(err, res)) return;
    console.error(err);
    res.status(502).json({ error: "Absender konnte nicht blockiert werden." });
  }
});


