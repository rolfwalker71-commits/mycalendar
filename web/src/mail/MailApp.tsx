import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  Mail,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppSwitcher } from "@/components/AppSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Me } from "@/lib/types";
import { ComposeSheet, type ComposeState } from "./ComposeSheet";
import { MailAvatar } from "./MailAvatar";
import { displayName, formatMailDate, formatMailDateLong } from "./format";
import type { AppModule, MailLabel, MailMessage, MailThread, MailThreadSummary } from "./types";
import { PullToRefresh } from "@/components/PullToRefresh";
import { GeminiCard, HighlightCards } from "@/components/AiSummary";

function handleAuthError(err: unknown, onReauth: () => void, onScope?: () => void) {
  if (err instanceof ApiError && err.code === "gmail_scope") {
    onScope?.();
    return true;
  }
  if (err instanceof ApiError && (err.status === 401 || err.code === "reauth")) {
    toast.error("Bitte erneut anmelden.");
    onReauth();
    return true;
  }
  return false;
}

const BOX_ICONS: Record<string, typeof Inbox> = {
  INBOX: Inbox,
  STARRED: Star,
  DRAFT: Pencil,
  SENT: Send,
  SPAM: Mail,
  TRASH: Trash2,
};

function MailboxRow({
  label,
  active,
  onClick,
}: {
  label: MailLabel;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = BOX_ICONS[label.id] ?? Mail;
  const unread = label.threadsUnread || label.messagesUnread;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px]",
        active ? "bg-mail/10 text-mail" : "hover:bg-muted",
      )}
    >
      <Icon className={cn("size-4", active ? "text-mail" : "text-mail")} />
      <span className="min-w-0 flex-1 truncate font-medium">{label.name}</span>
      {unread ? (
        <span className={cn("text-[11px] tabular-nums", active ? "text-mail" : "text-muted-foreground")}>
          {unread}
        </span>
      ) : null}
    </button>
  );
}

function FolderDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setShown(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setShown(false);
    const t = window.setTimeout(() => setPresent(false), 750);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!present) return null;
  return (
    <div className="absolute inset-0 z-30 lg:hidden">
      <button
        type="button"
        aria-label="Ordner schliessen"
        className={cn(
          "absolute inset-x-0 bottom-0 top-[3.75rem] bg-black/35 transition-opacity duration-[750ms] ease-in-out",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <nav
        className={cn(
          "absolute top-[3.75rem] bottom-3 left-0 flex w-[min(17.5rem,78vw)] flex-col overflow-hidden rounded-tr-2xl rounded-br-2xl bg-card shadow-2xl ring-1 ring-border transition-transform duration-[750ms] ease-in-out",
          shown ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="min-h-0 flex-1 overflow-auto text-[13px]">{children}</div>
      </nav>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  selfEmail,
  selfPhoto,
  threaded,
  onClick,
}: {
  thread: MailThreadSummary;
  active: boolean;
  selfEmail?: string;
  selfPhoto?: string | null;
  threaded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 border-b border-border px-4 py-3 text-left",
        active ? "bg-muted" : "hover:bg-muted/70",
        thread.unread ? "bg-card" : "",
      )}
    >
      <span
        className={cn(
          "mt-4 size-2.5 shrink-0 rounded-full",
          thread.unread ? "bg-mail" : "bg-transparent",
        )}
      />
      <MailAvatar
        addr={thread.from}
        selfEmail={selfEmail}
        selfPhoto={selfPhoto}
        className="mt-0.5 size-9 text-xs"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("truncate text-[15px]", thread.unread ? "font-semibold" : "font-medium")}>
            {displayName(thread.from)}
          </span>
          <span className={cn("shrink-0 text-xs", thread.unread ? "text-mail" : "text-muted-foreground")}>
            {formatMailDate(thread.date, thread.internalDate)}
          </span>
        </span>
        <span className={cn("mt-0.5 block truncate text-sm", thread.unread ? "font-medium" : "")}>
          {thread.subject || "(kein Betreff)"}
          {threaded && thread.messageCount > 1 ? (
            <span className="ml-1 text-muted-foreground font-normal">{thread.messageCount}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">{thread.snippet}</span>
      </span>
      {thread.starred ? <Star className="mt-1 size-4 shrink-0 fill-amber-400 text-amber-400" /> : null}
    </button>
  );
}

const ISOLATED_HTML_CSS = `
:host {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  font-size: 16px;
  line-height: 1.375;
  overflow-wrap: break-word;
  word-break: break-word;
  color: inherit;
}
img {
  max-width: 100%;
  height: auto;
}
a {
  color: var(--mail, #007aff);
}
`;

function openIsolatedMailLink(event: Event) {
  const anchor = event
    .composedPath()
    .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
  if (!anchor?.href) return;
  event.preventDefault();
  window.open(anchor.href, "_blank", "noopener,noreferrer");
}

/** Renders HTML email in a Shadow DOM so author CSS cannot leak into the app. */
function IsolatedHtml({ html }: { html: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ISOLATED_HTML_CSS;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    shadow.replaceChildren(style, wrap);
    shadow.addEventListener("click", openIsolatedMailLink);
    return () => shadow.removeEventListener("click", openIsolatedMailLink);
  }, [html]);

  return <div ref={hostRef} />;
}

function MessageBody({
  message,
  loadImages,
}: {
  message: MailMessage;
  loadImages: boolean;
}) {
  const html = useMemo(() => {
    if (!message.html) return "";
    if (loadImages) return message.html;
    return message.html.replace(/<img\b[^>]*>/gi, "").replace(/\ssrc=("[^"]*"|'[^']*')/gi, ' src=""');
  }, [message.html, loadImages]);

  if (html) {
    return <IsolatedHtml html={html} />;
  }
  return (
    <pre className="whitespace-pre-wrap font-sans text-[16px] leading-snug text-foreground">
      {message.text || message.snippet}
    </pre>
  );
}

function ThreadDetail({
  thread,
  selfEmail,
  selfPhoto,
  geminiAvailable,
  threaded,
  onReply,
  onArchive,
  onTrash,
  onToggleStar,
  onBack,
  showBack,
}: {
  thread: MailThread;
  selfEmail?: string;
  selfPhoto?: string | null;
  geminiAvailable?: boolean;
  threaded: boolean;
  onReply: (message: MailMessage) => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const [loadImages, setLoadImages] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1];
  if (!first || !last) {
    return <p className="p-6 text-sm text-muted-foreground">Keine Nachrichten.</p>;
  }
  const hasRemoteImages = thread.messages.some((m) => /<img/i.test(m.html));
  const cards = thread.messages.flatMap((m) => m.cards ?? []);

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const res = await apiClient.aiMailSummary(thread.id, threaded);
      setSummary(res.text);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Zusammenfassung fehlgeschlagen.");
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        {showBack ? (
          <Button variant="ghost" size="icon" aria-label="Zurück" onClick={onBack}>
            <ArrowLeft className="size-5 text-mail" />
          </Button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate px-2 text-base font-semibold">
          {first.subject || "(kein Betreff)"}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Markieren" onClick={onToggleStar}>
          <Star className={cn("size-5", thread.starred ? "fill-amber-400 text-amber-400" : "text-mail")} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Archivieren" onClick={onArchive}>
          <Archive className="size-5 text-mail" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Löschen" onClick={onTrash}>
          <Trash2 className="size-5 text-mail" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Antworten" onClick={() => onReply(last)}>
          <Reply className="size-5 text-mail" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <HighlightCards cards={cards} />
        <GeminiCard
          title="Zusammenfassung"
          text={summary}
          loading={summaryLoading}
          available={geminiAvailable}
          onGenerate={() => void loadSummary()}
        />
        {hasRemoteImages && !loadImages ? (
          <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
            <span>Externe Bilder sind ausgeblendet.</span>
            <Button variant="ghost" className="text-mail" onClick={() => setLoadImages(true)}>
              Laden
            </Button>
          </div>
        ) : null}
        {thread.messages.map((message) => (
          <article key={message.id} className="border-b border-border px-4 py-4">
            <div className="flex items-start gap-3">
              <MailAvatar addr={message.from} selfEmail={selfEmail} selfPhoto={selfPhoto} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold">{displayName(message.from)}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatMailDateLong(message.date, message.internalDate)}
                  </p>
                </div>
                <p className="truncate text-sm text-muted-foreground">An: {message.to || "mich"}</p>
              </div>
            </div>
            <div className="mt-4">
              <MessageBody message={message} loadImages={loadImages} />
            </div>
            {message.attachments.length ? (
              <ul className="mt-3 flex flex-col gap-1">
                {message.attachments.map((a) => (
                  <li key={a.attachmentId}>
                    <a
                      className="inline-flex items-center gap-2 text-sm text-mail hover:underline"
                      href={`/api/mail/messages/${encodeURIComponent(a.messageId)}/attachments/${encodeURIComponent(a.attachmentId)}?filename=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mimeType)}`}
                    >
                      <Paperclip className="size-4" />
                      {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function MailApp({
  me,
  onLogout,
  module,
  onModule,
  threaded,
  onOpenSettings,
}: {
  me: Me;
  onLogout: () => void;
  module: AppModule;
  onModule: (next: AppModule) => void;
  threaded: boolean;
  onOpenSettings: () => void;
}) {
  const desktop = useDesktop();
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [labelId, setLabelId] = useState("INBOX");
  const [threads, setThreads] = useState<MailThreadSummary[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<MailThread | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [needsScope, setNeedsScope] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({ open: false });
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [foldersOpen, setFoldersOpen] = useState(false);

  const activeLabel = labels.find((l) => l.id === labelId);
  const systemLabels = labels.filter((l) => l.type === "system");
  const userLabels = labels.filter((l) => l.type === "user");

  const loadLabels = useCallback(async () => {
    const { labels: next } = await apiClient.mailLabels();
    setLabels(next);
    setNeedsScope(false);
  }, []);

  const loadThreads = useCallback(
    async (pageToken?: string) => {
      setLoadingList(true);
      try {
        const res = await apiClient.mailThreads({
          labelId,
          q: appliedQuery || undefined,
          pageToken,
          threaded,
        });
        setThreads((prev) => (pageToken ? [...prev, ...res.threads] : res.threads));
        setNextPage(res.nextPageToken);
        setNeedsScope(false);
      } finally {
        setLoadingList(false);
      }
    },
    [appliedQuery, labelId, threaded],
  );

  useEffect(() => {
    loadLabels().catch((err) => {
      if (!handleAuthError(err, onLogout, () => setNeedsScope(true))) {
        toast.error(err instanceof ApiError ? err.message : "Postfächer fehlgeschlagen.");
      }
    });
  }, [loadLabels, onLogout]);

  useEffect(() => {
    setSelectedId(null);
    setThread(null);
    loadThreads().catch((err) => {
      if (!handleAuthError(err, onLogout, () => setNeedsScope(true))) {
        toast.error(err instanceof ApiError ? err.message : "Nachrichten fehlgeschlagen.");
      }
    });
  }, [loadThreads, onLogout]);

  async function openThread(id: string) {
    setSelectedId(id);
    setLoadingThread(true);
    if (!desktop) setMobilePane("thread");
    setFoldersOpen(false);
    try {
      const next = await apiClient.mailThread(id, threaded);
      setThread(next);
      if (next.unread) {
        await apiClient.mailModify(id, [], ["UNREAD"], threaded);
        setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
        setThread({ ...next, unread: false, messages: next.messages.map((m) => ({ ...m, unread: false })) });
      }
    } catch (err) {
      if (!handleAuthError(err, onLogout, () => setNeedsScope(true))) {
        toast.error(err instanceof ApiError ? err.message : "Nachricht fehlgeschlagen.");
      }
    } finally {
      setLoadingThread(false);
    }
  }

  async function archive() {
    if (!selectedId) return;
    await apiClient.mailModify(selectedId, [], ["INBOX"], threaded);
    setThreads((ts) => ts.filter((t) => t.id !== selectedId));
    setThread(null);
    setSelectedId(null);
    if (!desktop) setMobilePane("list");
  }

  async function trash() {
    if (!selectedId) return;
    if (labelId === "TRASH") await apiClient.mailUntrash(selectedId, threaded);
    else await apiClient.mailTrash(selectedId, threaded);
    setThreads((ts) => ts.filter((t) => t.id !== selectedId));
    setThread(null);
    setSelectedId(null);
    if (!desktop) setMobilePane("list");
  }

  async function toggleStar() {
    if (!selectedId || !thread) return;
    if (thread.starred) await apiClient.mailModify(selectedId, [], ["STARRED"], threaded);
    else await apiClient.mailModify(selectedId, ["STARRED"], [], threaded);
    setThread({ ...thread, starred: !thread.starred });
    setThreads((ts) => ts.map((t) => (t.id === selectedId ? { ...t, starred: !t.starred } : t)));
  }

  const account = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Konto" />}
      >
        <Avatar className="size-8">
          {me.pictureUrl ? <AvatarImage src={me.pictureUrl} alt="" /> : null}
          <AvatarFallback>{(me.name ?? me.email).slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-2 text-sm">
          <div className="font-medium">{me.name}</div>
          <div className="text-muted-foreground">{me.email}</div>
        </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings}>Einstellungen</DropdownMenuItem>
            <DropdownMenuItem onClick={() => apiClient.logout().finally(onLogout)}>Abmelden</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (needsScope) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <AppSwitcher value={module} onChange={onModule} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Einstellungen" onClick={onOpenSettings}>
              <Settings className="size-5" />
            </Button>
            {account}
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <Mail className="size-10 text-mail" />
          <h1 className="text-2xl font-semibold">Mail freigeben</h1>
          <p className="max-w-sm text-muted-foreground">
            Beim nächsten Google-Login wird der Zugriff auf Gmail (Workspace) angefordert. Danach erscheint der Posteingang hier.
          </p>
          <a href="/api/auth/google">
            <Button className="bg-mail text-mail-foreground hover:bg-mail/90">Mit Google fortfahren</Button>
          </a>
        </div>
      </div>
    );
  }

  const boxes = (
    <nav className="flex flex-col gap-0.5 p-2">
      <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Postfächer
      </p>
      {systemLabels.map((label) => (
        <MailboxRow
          key={label.id}
          label={label}
          active={labelId === label.id}
          onClick={() => {
            setLabelId(label.id);
            setFoldersOpen(false);
            if (!desktop) setMobilePane("list");
          }}
        />
      ))}
      {userLabels.length ? (
        <>
          <p className="mt-3 px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Ordner
          </p>
          {userLabels.map((label) => (
            <MailboxRow
              key={label.id}
              label={label}
              active={labelId === label.id}
              onClick={() => {
                setLabelId(label.id);
                setFoldersOpen(false);
                if (!desktop) setMobilePane("list");
              }}
            />
          ))}
        </>
      ) : null}
    </nav>
  );

  const list = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {!desktop ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Postfächer"
            aria-expanded={foldersOpen}
            onClick={() => setFoldersOpen((v) => !v)}
          >
            <ChevronRight
              className={cn(
                "size-5 text-mail transition-transform duration-[750ms] ease-in-out",
                foldersOpen ? "rotate-0" : "-rotate-180",
              )}
            />
          </Button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">
          {activeLabel?.name ?? "Posteingang"}
        </h1>
      </div>
      <form
        className="border-b border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedQuery(query.trim());
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onValueChange={setQuery}
            placeholder="Suchen"
            className="rounded-full bg-muted pl-9"
            aria-label="Mail durchsuchen"
          />
        </div>
      </form>
      <PullToRefresh
        onRefresh={async () => {
          await loadThreads();
          await loadLabels().catch(() => undefined);
        }}
        disabled={loadingList}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          {loadingList && !threads.length ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Laden…
            </div>
          ) : !threads.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Keine Nachrichten.</p>
          ) : (
            threads.map((item) => (
              <ThreadRow
                key={item.id}
                thread={item}
                active={item.id === selectedId}
                selfEmail={me.email}
                selfPhoto={me.pictureUrl}
                threaded={threaded}
                onClick={() => openThread(item.id)}
              />
            ))
          )}
          {nextPage ? (
            <div className="p-3">
              <Button variant="outline" className="w-full" onClick={() => loadThreads(nextPage)}>
                Weitere laden
              </Button>
            </div>
          ) : null}
        </div>
      </PullToRefresh>
    </div>
  );

  const detail = loadingThread && !thread ? (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" />
      Laden…
    </div>
  ) : thread ? (
    <ThreadDetail
      key={thread.id}
      thread={thread}
      selfEmail={me.email}
      selfPhoto={me.pictureUrl}
      geminiAvailable={me.geminiAvailable}
      threaded={threaded}
      showBack={!desktop}
      onBack={() => {
        setMobilePane("list");
        setThread(null);
        setSelectedId(null);
      }}
      onReply={(message) => setCompose({ open: true, mode: "reply", replyTo: message })}
      onArchive={() => archive().catch((err) => toast.error(err instanceof ApiError ? err.message : "Archivieren fehlgeschlagen."))}
      onTrash={() => trash().catch((err) => toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen."))}
      onToggleStar={() => toggleStar().catch((err) => toast.error(err instanceof ApiError ? err.message : "Markierung fehlgeschlagen."))}
    />
  ) : (
    <div className="hidden flex-1 flex-col items-center justify-center text-muted-foreground lg:flex">
      <Mail className="mb-3 size-10 opacity-40" />
      <p>Eine Nachricht auswählen</p>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 lg:px-4">
        <AppSwitcher value={module} onChange={onModule} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Einstellungen" onClick={onOpenSettings}>
            <Settings className="size-5" />
          </Button>
          {account}
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {desktop ? (
          <>
            <aside className="hidden w-64 shrink-0 overflow-auto border-r border-border lg:block">{boxes}</aside>
            <div className="flex w-[min(100%,24rem)] shrink-0">{list}</div>
            <div className="flex min-w-0 flex-1 flex-col">{detail}</div>
          </>
        ) : mobilePane === "thread" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detail}</div>
        ) : (
          list
        )}
        <FolderDrawer open={foldersOpen} onClose={() => setFoldersOpen(false)}>
          {boxes}
        </FolderDrawer>
      </div>
      <Button
        className="fixed right-4 bottom-6 z-40 size-14 rounded-full bg-mail text-mail-foreground shadow-lg hover:bg-mail/90"
        size="icon"
        aria-label="Neue Nachricht"
        onClick={() => setCompose({ open: true, mode: "new" })}
      >
        <Pencil className="size-6" />
      </Button>
      {compose.open ? (
        <ComposeSheet
          key={`${compose.mode}-${compose.replyTo?.id ?? "new"}`}
          state={compose}
          desktop={desktop}
          onOpenChange={(open) => setCompose(open ? compose : { open: false })}
          onSent={() => {
            loadThreads().catch(() => undefined);
            loadLabels().catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}

function useDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = () => setDesktop(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return desktop;
}
