import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api";
import { AddressField } from "./AddressField";
import { HtmlEditor } from "./HtmlEditor";
import { forwardSubject, quotedForwardHtml, replyAllRecipients, replySubject } from "./format";
import type { MailAttachment, MailMessage } from "./types";

const MAX_ATTACH = 20 * 1024 * 1024;

export type ComposeState =
  | { open: false }
  | {
      open: true;
      mode: "new" | "reply" | "replyAll" | "forward" | "draft";
      replyTo?: MailMessage;
      draftId?: string;
      to?: string;
    };

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fileToAttachment(file: File): Promise<{ filename: string; mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      data: String(reader.result ?? ""),
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ComposeSheet({
  state,
  desktop,
  selfEmail,
  onOpenChange,
  onSent,
  onReconnect,
}: {
  state: ComposeState;
  desktop: boolean;
  selfEmail: string;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
  onReconnect?: () => void;
}) {
  const reply = state.open ? state.replyTo : undefined;
  const mode = state.open ? state.mode : "new";
  const initialDraftId = state.open ? state.draftId : undefined;

  const initial = useMemo(() => {
    if (!state.open) {
      return { to: "", cc: "", bcc: "", subject: "", html: "" };
    }
    if (mode === "reply" && reply) {
      return {
        to: reply.from.email,
        cc: "",
        bcc: "",
        subject: replySubject(reply.subject),
        html: "",
      };
    }
    if (mode === "replyAll" && reply) {
      const rec = replyAllRecipients(reply, selfEmail);
      return {
        to: rec.to.join(", "),
        cc: rec.cc.join(", "),
        bcc: "",
        subject: replySubject(reply.subject),
        html: "",
      };
    }
    if (mode === "forward" && reply) {
      return {
        to: "",
        cc: "",
        bcc: "",
        subject: forwardSubject(reply.subject),
        html: quotedForwardHtml(reply),
      };
    }
    return {
      to: state.open && state.to ? state.to : "",
      cc: "",
      bcc: "",
      subject: "",
      html: "",
    };
  }, [state.open, mode, reply, selfEmail, state.open ? state.to : ""]);

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState(initial.bcc);
  const [subject, setSubject] = useState(initial.subject);
  const [html, setHtml] = useState(initial.html);
  const [from, setFrom] = useState(selfEmail);
  const [aliases, setAliases] = useState<{ sendAsEmail: string; displayName: string; isDefault: boolean; signature: string }[]>([]);
  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; data: string; size: number }[]>([]);
  const [includeOrigAtt, setIncludeOrigAtt] = useState(mode === "forward");
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState(initialDraftId ?? "");
  const [savingDraft, setSavingDraft] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const editorKey = `${mode}-${reply?.id ?? "new"}-${draftId || "x"}`;
  const saveTimer = useRef<number>(0);
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

  useEffect(() => {
    apiClient.mailSendAs()
      .then((res) => {
        setAliases(res.aliases);
        const def = res.aliases.find((a) => a.isDefault) ?? res.aliases[0];
        if (def) setFrom(def.sendAsEmail);
        const sig = (def?.signature || res.aliases.find((a) => a.signature)?.signature || "").trim();
        if (sig && mode !== "draft") {
          setHtml((prev) => (prev.includes(sig) ? prev : `${prev}<br><div class="signature">--<br>${sig}</div>`));
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.code === "gmail_scope" || err.code === "api_disabled")) {
          onReconnect?.();
        }
      });
  }, [mode, onReconnect]);

  useEffect(() => {
    if (mode !== "draft" || !initialDraftId) return;
    apiClient.mailDraftGet(initialDraftId)
      .then((res) => {
        const msg = res.message;
        if (!msg) return;
        setTo(msg.to);
        setCc(msg.cc);
        setBcc(msg.bcc);
        setShowBcc(Boolean(msg.bcc));
        setSubject(msg.subject);
        setHtml(msg.html || (msg.text ? `<pre>${msg.text}</pre>` : ""));
        setDraftId(res.id);
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : "Entwurf konnte nicht geladen werden.");
      });
  }, [mode, initialDraftId]);

  const origAtt: MailAttachment[] = mode === "forward" && includeOrigAtt ? (reply?.attachments ?? []) : [];

  function composePayload() {
    return {
      to: splitAddresses(to),
      cc: splitAddresses(cc),
      bcc: splitAddresses(bcc),
      subject,
      html,
      from,
      threadId: mode === "forward" ? undefined : reply?.threadId,
      inReplyTo: mode === "reply" || mode === "replyAll" ? reply?.messageId || undefined : undefined,
      references:
        (mode === "reply" || mode === "replyAll") && reply
          ? [reply.references, reply.messageId].filter(Boolean).join(" ")
          : undefined,
      draftId: draftId || undefined,
      attachments: attachments.map(({ filename, mimeType, data }) => ({ filename, mimeType, data })),
      forwardAttachments: origAtt.map((a) => ({
        messageId: a.messageId,
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
      })),
    };
  }

  useEffect(() => {
    if (!state.open) return;
    window.clearTimeout(saveTimer.current);
    const empty = !to.trim() && !cc.trim() && !subject.trim() && !html.replace(/<[^>]+>/g, "").trim();
    if (empty && !draftId) return;
    saveTimer.current = window.setTimeout(() => {
      setSavingDraft(true);
      apiClient
        .mailDraft({ ...composePayload(), draftId: draftIdRef.current || undefined })
        .then((res) => {
          if (res.id) setDraftId(res.id);
        })
        .catch(() => undefined)
        .finally(() => setSavingDraft(false));
    }, 1400);
    return () => window.clearTimeout(saveTimer.current);
  }, [to, cc, bcc, subject, html, from, state.open]);

  const title =
    mode === "reply"
      ? "Antworten"
      : mode === "replyAll"
        ? "Allen antworten"
        : mode === "forward"
          ? "Weiterleiten"
          : mode === "draft"
            ? "Entwurf"
            : "Neue Nachricht";

  async function send() {
    const recipients = splitAddresses(to);
    if (!recipients.length) {
      toast.error("Bitte Empfänger eintragen.");
      return;
    }
    setSending(true);
    try {
      await apiClient.mailSend(composePayload());
      toast.success("Gesendet.");
      onSent();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Senden fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  async function discard() {
    window.clearTimeout(saveTimer.current);
    try {
      if (draftId) await apiClient.mailDraftDelete(draftId);
      toast.success("Entwurf verworfen.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verwerfen fehlgeschlagen.");
      return;
    }
    onSent();
    onOpenChange(false);
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    let total = attachments.reduce((n, a) => n + a.size, 0);
    const next = [...attachments];
    for (const file of Array.from(list)) {
      total += file.size;
      if (total > MAX_ATTACH) {
        toast.error("Der Anhang ist zu groß (max. 20 MB).");
        return;
      }
      const att = await fileToAttachment(file);
      next.push({ ...att, size: file.size });
    }
    setAttachments(next);
  }

  const body = (
    <div className="flex flex-col gap-3">
      {aliases.length > 1 ? (
        <div className="grid gap-1.5">
          <Label>Von</Label>
          <Select value={from} onValueChange={(v) => setFrom(String(v ?? selfEmail))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aliases.map((a) => (
                <SelectItem key={a.sendAsEmail} value={a.sendAsEmail}>
                  {a.displayName ? `${a.displayName} <${a.sendAsEmail}>` : a.sendAsEmail}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <AddressField id="mail-to" label="An" value={to} onValueChange={setTo} placeholder="name@example.com" onReconnect={onReconnect} />
      <AddressField id="mail-cc" label="Kopie" value={cc} onValueChange={setCc} placeholder="optional" onReconnect={onReconnect} />
      {showBcc ? (
        <AddressField id="mail-bcc" label="Blindkopie" value={bcc} onValueChange={setBcc} placeholder="optional" onReconnect={onReconnect} />
      ) : (
        <button type="button" className="self-start text-xs text-mail" onClick={() => setShowBcc(true)}>
          Blindkopie
        </button>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="mail-subject">Betreff</Label>
        <Input id="mail-subject" value={subject} onValueChange={setSubject} />
      </div>
      <HtmlEditor html={html} onChange={setHtml} resetKey={editorKey} />
      {mode === "forward" && reply?.attachments.length ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={includeOrigAtt} onCheckedChange={(v) => setIncludeOrigAtt(v === true)} />
          Originalanhänge weiterleiten
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" render={<label className="cursor-pointer" />}>
          <Paperclip className="size-4" />
          Anhängen
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Button>
        {savingDraft ? <span className="text-xs text-muted-foreground">Speichert Entwurf…</span> : draftId ? (
          <span className="text-xs text-muted-foreground">Entwurf gespeichert</span>
        ) : null}
      </div>
      {attachments.length ? (
        <ul className="flex flex-col gap-1">
          {attachments.map((a, i) => (
            <li key={`${a.filename}-${i}`} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setAttachments((xs) => xs.filter((_, j) => j !== i))}
              >
                <XIcon className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Schließen
      </Button>
      {draftId || to || subject || html ? (
        <Button variant="outline" onClick={() => void discard()}>
          Verwerfen
        </Button>
      ) : null}
      <Button className="bg-mail text-mail-foreground hover:bg-mail/90" onClick={() => void send()} disabled={sending}>
        {sending ? "Sendet…" : "Senden"}
      </Button>
    </>
  );

  if (desktop) {
    return (
      <Dialog open={state.open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">E-Mail verfassen</DialogDescription>
          </DialogHeader>
          {body}
          <DialogFooter>{actions}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">E-Mail verfassen</SheetDescription>
        </SheetHeader>
        <div className="overflow-auto px-4 pb-2">{body}</div>
        <SheetFooter className="flex-row flex-wrap justify-end">{actions}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
