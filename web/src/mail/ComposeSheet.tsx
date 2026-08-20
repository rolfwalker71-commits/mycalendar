import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { apiClient, ApiError } from "@/lib/api";
import { replySubject } from "./format";
import type { MailMessage } from "./types";

export type ComposeState =
  | { open: false }
  | {
      open: true;
      mode: "new" | "reply" | "replyAll";
      replyTo?: MailMessage;
    };

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ComposeSheet({
  state,
  desktop,
  onOpenChange,
  onSent,
}: {
  state: ComposeState;
  desktop: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}) {
  const reply = state.open ? state.replyTo : undefined;
  const [to, setTo] = useState(() => (reply ? reply.from.email : ""));
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(() =>
    reply ? replySubject(reply.subject) : "",
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const title =
    state.open && state.mode === "reply"
      ? "Antworten"
      : state.open && state.mode === "replyAll"
        ? "Allen antworten"
        : "Neue Nachricht";

  async function send() {
    const recipients = splitAddresses(to);
    if (!recipients.length) {
      toast.error("Bitte Empfänger eintragen.");
      return;
    }
    setSending(true);
    try {
      await apiClient.mailSend({
        to: recipients,
        cc: splitAddresses(cc),
        subject,
        text,
        threadId: reply?.threadId,
        inReplyTo: reply?.messageId || undefined,
        references: reply
          ? [reply.references, reply.messageId].filter(Boolean).join(" ")
          : undefined,
      });
      toast.success("Gesendet.");
      onSent();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Senden fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  }

  const body = (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="mail-to">An</Label>
        <Input
          id="mail-to"
          value={to}
          onValueChange={setTo}
          placeholder="name@example.com"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-cc">Kopie</Label>
        <Input
          id="mail-cc"
          value={cc}
          onValueChange={setCc}
          placeholder="optional"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-subject">Betreff</Label>
        <Input id="mail-subject" value={subject} onValueChange={setSubject} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mail-body">Nachricht</Label>
        <Textarea
          id="mail-body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-48"
        />
      </div>
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Abbrechen
      </Button>
      <Button className="bg-mail text-mail-foreground hover:bg-mail/90" onClick={send} disabled={sending}>
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
        <SheetFooter className="flex-row justify-end">{actions}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
