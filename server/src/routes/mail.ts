import { Router } from "express";
import type { Request } from "express";
import type { gmail_v1 } from "googleapis";
import { requireAuth } from "../auth.js";
import {
  GoogleAuthError,
  getAuthedGmail,
  isInsufficientScope,
} from "../google.js";
import {
  buildRfc822,
  headerMap,
  mapPool,
  parseAddress,
  parsePayload,
  scrubHtml,
} from "../mailMime.js";

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

function handleMailError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
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

async function gmailFor(req: Request) {
  return getAuthedGmail(req.user!);
}

mailRouter.get("/labels", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.labels.list({ userId: "me" });
    const byId = new Map((data.labels ?? []).map((l) => [l.id ?? "", l]));
    const system = SYSTEM_LABELS.map((s) => {
      const label = byId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        type: "system" as const,
        messagesTotal: label?.messagesTotal ?? 0,
        messagesUnread: label?.messagesUnread ?? 0,
        threadsTotal: label?.threadsTotal ?? 0,
        threadsUnread: label?.threadsUnread ?? 0,
      };
    });
    const user = (data.labels ?? [])
      .filter((l) => l.type === "user" && l.id && l.name)
      .map((l) => ({
        id: l.id as string,
        name: l.name as string,
        type: "user" as const,
        messagesTotal: l.messagesTotal ?? 0,
        messagesUnread: l.messagesUnread ?? 0,
        threadsTotal: l.threadsTotal ?? 0,
        threadsUnread: l.threadsUnread ?? 0,
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
    from,
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

mailRouter.get("/threads", async (req, res) => {
  const labelId = String(req.query.labelId ?? "INBOX");
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
  const maxResults = Math.min(50, Math.max(10, Number(req.query.maxResults ?? 30) || 30));
  try {
    const gmail = await gmailFor(req);
    const list = await gmail.users.threads.list({
      userId: "me",
      labelIds: labelId ? [labelId] : undefined,
      q: q || undefined,
      pageToken,
      maxResults,
    });
    const threads = await mapPool(list.data.threads ?? [], 6, async (t) => {
      const { data } = await gmail.users.threads.get({
        userId: "me",
        id: t.id ?? "",
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });
      const messages = data.messages ?? [];
      const last = messages[messages.length - 1] ?? {};
      const summary = summarizeMessage(last);
      const unread = messages.some((m) => (m.labelIds ?? []).includes("UNREAD"));
      const starred = messages.some((m) => (m.labelIds ?? []).includes("STARRED"));
      return {
        ...summary,
        id: data.id ?? t.id ?? "",
        snippet: data.snippet ?? t.snippet ?? summary.snippet,
        messageCount: messages.length,
        unread,
        starred,
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

mailRouter.get("/threads/:id", async (req, res) => {
  try {
    const gmail = await gmailFor(req);
    const { data } = await gmail.users.threads.get({
      userId: "me",
      id: req.params.id,
      format: "full",
    });
    const messages = (data.messages ?? []).map((message) => {
      const headers = headerMap(message.payload?.headers);
      const parsed = parsePayload(message.payload);
      const from = parseAddress(headers.from);
      const labels = message.labelIds ?? [];
      return {
        id: message.id ?? "",
        threadId: message.threadId ?? data.id ?? "",
        from,
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
      };
    });
    res.json({
      id: data.id ?? req.params.id,
      messages,
      unread: messages.some((m) => m.unread),
      starred: messages.some((m) => m.starred),
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

mailRouter.post("/send", async (req, res) => {
  const to = Array.isArray(req.body?.to)
    ? req.body.to.filter((x: unknown) => typeof x === "string")
    : typeof req.body?.to === "string"
      ? req.body.to.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
      : [];
  const cc = Array.isArray(req.body?.cc)
    ? req.body.cc.filter((x: unknown) => typeof x === "string")
    : [];
  const bcc = Array.isArray(req.body?.bcc)
    ? req.body.bcc.filter((x: unknown) => typeof x === "string")
    : [];
  const subject = typeof req.body?.subject === "string" ? req.body.subject : "";
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  const threadId = typeof req.body?.threadId === "string" ? req.body.threadId : undefined;
  const inReplyTo = typeof req.body?.inReplyTo === "string" ? req.body.inReplyTo : undefined;
  const references = typeof req.body?.references === "string" ? req.body.references : undefined;
  if (!to.length) {
    res.status(400).json({ error: "Empfänger fehlt." });
    return;
  }
  try {
    const gmail = await gmailFor(req);
    const raw = buildRfc822({
      from: req.user!.email,
      to,
      cc,
      bcc,
      subject,
      text,
      inReplyTo,
      references,
    });
    const { data } = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: Buffer.from(raw).toString("base64url"),
        threadId,
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
