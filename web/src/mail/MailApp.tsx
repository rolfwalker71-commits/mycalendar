import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  BellOff,
  CalendarPlus,
  CheckSquare,
  ChevronRight,
  Cloud,
  FolderInput,
  Forward,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Reply,
  ReplyAll,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "@/components/AppLogo";
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
import { useLiveSync } from "@/lib/liveSync";
import { GMAIL_LABEL_COLORS } from "./gmailColors";
import { PullToRefresh } from "@/components/PullToRefresh";
import { GeminiCard, HighlightCards } from "@/components/AiSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { SwipeableRow } from "@/components/SwipeableRow";

const MAIL_LIST_CACHE = "mail-list-v1";
const MAIL_LABELS_CACHE = "mail-labels-v2";

function labelBadgeCount(label: MailLabel, threaded: boolean): number {
  if (label.id === "DRAFT") return label.messagesTotal || label.threadsTotal;
  if (label.id === "SENT" || label.id === "TRASH") return 0;
  return threaded
    ? label.threadsUnread || label.messagesUnread
    : label.messagesUnread || label.threadsUnread;
}

function readJsonCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeJsonCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

function mailListCacheKey(labelId: string, q: string, threaded: boolean): string {
  return `${MAIL_LIST_CACHE}:${threaded ? "t" : "m"}:${labelId}:${q}`;
}

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
  badge,
  onClick,
}: {
  label: MailLabel;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  const Icon = BOX_ICONS[label.id] ?? Mail;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem]",
        active ? "bg-mail/10 text-mail" : "hover:bg-muted",
      )}
    >
      <Icon className={cn("size-4", active ? "text-mail" : "text-mail")} />
      {label.type === "user" && label.color?.backgroundColor ? (
        <span
          className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: label.color.backgroundColor }}
        />
      ) : null}
      <span className="min-w-0 flex-1 break-words leading-snug font-medium">{label.name}</span>
      {badge > 0 ? (
        <span className="shrink-0 text-[0.75rem] font-semibold tabular-nums text-mail">{badge}</span>
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
  const [present, setPresent] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    setShown(false);
    const t = window.setTimeout(() => setPresent(false), 750);
    return () => window.clearTimeout(t);
  }, [open]);

  useLayoutEffect(() => {
    if (!present || !open) return;
    const t = window.setTimeout(() => setShown(true), 30);
    return () => window.clearTimeout(t);
  }, [present, open]);

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
    <div className="absolute inset-0 z-30 overflow-hidden lg:hidden">
      <button
        type="button"
        aria-label="Ordner schliessen"
        className={cn(
          "absolute inset-0 bg-black/35 transition-opacity duration-[750ms] ease-in-out",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <nav
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(17.5rem,78vw)] flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-border transition-transform duration-[750ms] ease-in-out will-change-transform",
          shown ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="min-h-0 flex-1 overflow-auto text-[0.8125rem]">{children}</div>
      </nav>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  selected,
  selecting,
  selfEmail,
  selfPhoto,
  threaded,
  onToggleSelect,
}: {
  thread: MailThreadSummary;
  active: boolean;
  selected: boolean;
  selecting: boolean;
  selfEmail?: string;
  selfPhoto?: string | null;
  threaded: boolean;
  onToggleSelect: () => void;
}) {
  const isThread = threaded && thread.messageCount > 1;
  return (
    <div
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left",
        selected ? "bg-mail/10" : active ? "bg-muted" : "bg-card hover:bg-muted",
      )}
    >
      {selecting ? (
        <span
          className="mt-3 shrink-0"
          data-swipe-ignore
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onCheckedChange={() => onToggleSelect()} aria-label="Auswählen" />
        </span>
      ) : (
        <span
          className={cn(
            "mt-4 size-2.5 shrink-0 rounded-full",
            thread.unread ? "bg-mail" : "bg-transparent",
          )}
        />
      )}
      <button
        type="button"
        data-swipe-ignore
        className="relative mt-0.5 shrink-0"
        aria-label="Nachricht auswählen"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
      >
        <MailAvatar
          addr={thread.from}
          selfEmail={selfEmail}
          selfPhoto={selfPhoto}
          className="size-9 text-xs"
        />
        {isThread ? (
          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-mail text-[0.5625rem] font-bold text-mail-foreground ring-2 ring-card">
            {thread.messageCount > 9 ? "9+" : thread.messageCount}
          </span>
        ) : null}
      </button>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn("min-w-0 break-words leading-snug text-[0.9375rem] line-clamp-2", thread.unread ? "font-semibold" : "font-medium")}>
            {displayName(thread.from)}
          </span>
          <span className={cn("shrink-0 text-xs", thread.unread ? "text-mail" : "text-muted-foreground")}>
            {formatMailDate(thread.date, thread.internalDate)}
          </span>
        </span>
        <span className={cn("mt-0.5 flex min-w-0 items-center gap-1.5", thread.unread ? "font-medium" : "")}>
          <span className="min-w-0 break-words leading-snug text-sm line-clamp-2">{thread.subject || "(kein Betreff)"}</span>
          {isThread ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-mail/12 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-mail">
              <MessagesSquare className="size-3" />
              {thread.messageCount}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground line-clamp-2">{thread.snippet}</span>
      </span>
      {thread.draft ? (
        <span className="mt-1 shrink-0 text-[0.6875rem] font-medium text-mail">Entwurf</span>
      ) : null}
      {thread.starred ? <Star className="mt-1 size-4 shrink-0 fill-amber-400 text-amber-400" /> : null}
    </div>
  );
}

const ISOLATED_HTML_CSS = `
:host {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  font-size: 1rem;
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
    <pre className="whitespace-pre-wrap font-sans text-base leading-snug text-foreground">
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
  userLabels,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onTrash,
  onToggleStar,
  onMarkUnread,
  onSpam,
  onNotSpam,
  onToggleLabel,
  onBack,
  showBack,
}: {
  thread: MailThread;
  selfEmail?: string;
  selfPhoto?: string | null;
  geminiAvailable?: boolean;
  threaded: boolean;
  userLabels: MailLabel[];
  onReply: (message: MailMessage) => void;
  onReplyAll: (message: MailMessage) => void;
  onForward: (message: MailMessage) => void;
  onArchive: () => void;
  onTrash: () => void;
  onToggleStar: () => void;
  onMarkUnread: () => void;
  onSpam: () => void;
  onNotSpam: () => void;
  onToggleLabel: (labelId: string, on: boolean) => void;
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
  const threadLabelIds = new Set(thread.messages.flatMap((m) => m.labelIds ?? []));
  const appliedUserLabels = userLabels.filter((l) => threadLabelIds.has(l.id));
  const isSpam = threadLabelIds.has("SPAM");

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
        <h2 className="min-w-0 flex-1 break-words px-2 text-base font-semibold leading-snug line-clamp-2">
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
        <Button variant="ghost" size="icon" aria-label="Allen antworten" onClick={() => onReplyAll(last)}>
          <ReplyAll className="size-5 text-mail" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Weitere Aktionen" />}>
            <MoreHorizontal className="size-5 text-mail" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onForward(last)}>
              <Forward className="size-4" />
              Weiterleiten
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMarkUnread}>
              <MailOpen className="size-4" />
              Als ungelesen
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void apiClient
                  .mailModify(thread.id, ["MUTED"], ["INBOX"], threaded)
                  .then(() => toast.success("Unterhaltung stummgeschaltet."))
                  .catch((err) => toast.error(err instanceof ApiError ? err.message : "Stummschalten fehlgeschlagen."))
              }
            >
              <BellOff className="size-4" />
              Stummschalten
            </DropdownMenuItem>
            {last.from.email ? (
              <DropdownMenuItem
                onClick={() =>
                  void apiClient
                    .mailBlock(last.from.email, thread.id)
                    .then(() => toast.success("Absender blockiert."))
                    .catch((err) => toast.error(err instanceof ApiError ? err.message : "Blockieren fehlgeschlagen."))
                }
              >
                <Ban className="size-4" />
                Absender blockieren
              </DropdownMenuItem>
            ) : null}
            {isSpam ? (
              <DropdownMenuItem onClick={onNotSpam}>
                <ShieldCheck className="size-4" />
                Kein Spam
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onSpam}>
                <ShieldAlert className="size-4" />
                Als Spam
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Ordner</div>
            {userLabels.map((label) => {
              const on = threadLabelIds.has(label.id);
              return (
                <DropdownMenuItem
                  key={label.id}
                  onClick={() => onToggleLabel(label.id, !on)}
                >
                  <Tag className="size-4" />
                  <Checkbox checked={on} className="pointer-events-none" />
                  {label.name}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {appliedUserLabels.length ? (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {appliedUserLabels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                style={{
                  backgroundColor: label.color?.backgroundColor ?? "var(--muted)",
                  color: label.color?.textColor ?? "inherit",
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : null}
        <HighlightCards cards={cards} />
        <GeminiCard
          title="Zusammenfassung"
          text={summary}
          loading={summaryLoading}
          available={geminiAvailable}
          onGenerate={() => void loadSummary()}
        />
        {(thread.invites?.length || thread.eventHint) ? (
          <div className="mx-4 mt-3 flex flex-col gap-2 rounded-xl bg-muted px-3 py-2">
            {thread.invites?.map((inv) => (
              <div key={`${inv.messageId}-${inv.attachmentId}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  {inv.events[0]?.summary || inv.filename}
                </span>
                <Button
                  variant="ghost"
                  className="text-mail"
                  onClick={() =>
                    void apiClient
                      .mailToEvent({ messageId: inv.messageId, attachmentId: inv.attachmentId })
                      .then(() => toast.success("Termin liegt im Kalender."))
                      .catch((err) =>
                        toast.error(err instanceof ApiError ? err.message : "Termin fehlgeschlagen."),
                      )
                  }
                >
                  <CalendarPlus className="size-4" />
                  In den Kalender
                </Button>
              </div>
            ))}
            {!thread.invites?.length && thread.eventHint ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{thread.eventHint.summary}</span>
                <Button
                  variant="ghost"
                  className="text-mail"
                  onClick={() =>
                    void apiClient
                      .mailToEvent({
                        event: {
                          summary: thread.eventHint!.summary,
                          start: thread.eventHint!.start,
                          end: thread.eventHint!.end,
                          allDay: thread.eventHint!.allDay,
                          location: thread.eventHint!.location,
                          description: thread.eventHint!.description,
                        },
                      })
                      .then(() => toast.success("Termin liegt im Kalender."))
                      .catch((err) =>
                        toast.error(err instanceof ApiError ? err.message : "Termin fehlgeschlagen."),
                      )
                  }
                >
                  <CalendarPlus className="size-4" />
                  Vorschlag übernehmen
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
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
                  <p className="break-words font-semibold leading-snug">{displayName(message.from)}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatMailDateLong(message.date, message.internalDate)}
                  </p>
                </div>
                <p className="break-words text-sm leading-snug text-muted-foreground">An: {message.to || "mich"}</p>
              </div>
            </div>
            <div className="mt-4">
              <MessageBody message={message} loadImages={loadImages} />
            </div>
            {message.attachments.length ? (
              <ul className="mt-3 flex flex-col gap-1">
                {message.attachments.map((a) => (
                  <li key={a.attachmentId} className="flex flex-wrap items-center gap-2">
                    <a
                      className="inline-flex items-center gap-2 text-sm text-mail hover:underline"
                      href={`/api/mail/messages/${encodeURIComponent(a.messageId)}/attachments/${encodeURIComponent(a.attachmentId)}?filename=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mimeType)}`}
                    >
                      <Paperclip className="size-4" />
                      {a.filename}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-mail"
                      onClick={() =>
                        void apiClient
                          .mailSaveToDrive(a.messageId, a.attachmentId, a.filename, a.mimeType)
                          .then((res) => {
                            toast.success("In Drive gelegt.");
                            if (res.url) window.open(res.url, "_blank", "noopener");
                          })
                          .catch((err) =>
                            toast.error(err instanceof ApiError ? err.message : "Drive fehlgeschlagen. Bitte Google neu verbinden."),
                          )
                      }
                    >
                      <Cloud className="size-3.5" />
                      Drive
                    </Button>
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
  composeTo,
  onComposeToConsumed,
}: {
  me: Me;
  onLogout: () => void;
  module: AppModule;
  onModule: (next: AppModule) => void;
  threaded: boolean;
  onOpenSettings: () => void;
  composeTo?: string | null;
  onComposeToConsumed?: () => void;
}) {
  const desktop = useDesktop();
  const [labels, setLabels] = useState<MailLabel[]>(
    () => readJsonCache<MailLabel[]>(MAIL_LABELS_CACHE, 30 * 60 * 1000) ?? [],
  );
  const [labelId, setLabelId] = useState("INBOX");
  const [threads, setThreads] = useState<MailThreadSummary[]>(
    () =>
      readJsonCache<MailThreadSummary[]>(mailListCacheKey("INBOX", "", threaded), 30 * 60 * 1000) ??
      [],
  );
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<MailThread | null>(null);
  const [loadingList, setLoadingList] = useState(() => {
    const cached = readJsonCache<MailThreadSummary[]>(
      mailListCacheKey("INBOX", "", threaded),
      30 * 60 * 1000,
    );
    return !cached?.length;
  });
  const [loadingThread, setLoadingThread] = useState(false);
  const [needsScope, setNeedsScope] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({ open: false });
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const activeLabel = labels.find((l) => l.id === labelId);
  const systemLabels = labels.filter((l) => l.type === "system");
  const userLabels = labels.filter((l) => l.type === "user");

  const loadLabels = useCallback(async () => {
    const { labels: next } = await apiClient.mailLabels();
    setLabels(next);
    writeJsonCache(MAIL_LABELS_CACHE, next);
    setNeedsScope(false);
  }, []);

  function bumpUnread(folderIds: string[], delta: number) {
    if (!delta) return;
    const ids = new Set(folderIds);
    setLabels((prev) => {
      const next = prev.map((l) =>
        ids.has(l.id)
          ? {
              ...l,
              threadsUnread: Math.max(0, l.threadsUnread + delta),
              messagesUnread: Math.max(0, l.messagesUnread + delta),
            }
          : l,
      );
      writeJsonCache(MAIL_LABELS_CACHE, next);
      return next;
    });
  }

  function unreadFolders(current: string): string[] {
    if (current === "INBOX") return ["INBOX"];
    if (current === "SPAM" || current === "TRASH" || current === "DRAFT" || current === "SENT") {
      return [current];
    }
    return [current, "INBOX"];
  }

  const loadThreads = useCallback(
    async (pageToken?: string) => {
      const cacheKey = mailListCacheKey(labelId, appliedQuery, threaded);
      if (!pageToken) {
        const cached = readJsonCache<MailThreadSummary[]>(cacheKey, 30 * 60 * 1000);
        if (cached?.length) {
          setThreads(cached);
          setLoadingList(false);
        } else {
          setLoadingList(true);
        }
      } else {
        setLoadingList(true);
      }
      try {
        const res = await apiClient.mailThreads({
          labelId,
          q: appliedQuery || undefined,
          pageToken,
          threaded,
        });
        setThreads((prev) => (pageToken ? [...prev, ...res.threads] : res.threads));
        setNextPage(res.nextPageToken);
        if (!pageToken) writeJsonCache(cacheKey, res.threads);
        setNeedsScope(false);
      } finally {
        setLoadingList(false);
      }
    },
    [appliedQuery, labelId, threaded],
  );

  const [newLabel, setNewLabel] = useState("");
  const [labelPickId, setLabelPickId] = useState<string | null>(null);

  useLiveSync(
    useCallback(
      (kind) => {
        if (kind === "mail") {
          loadThreads().catch(() => undefined);
          loadLabels().catch(() => undefined);
        }
      },
      [loadThreads, loadLabels],
    ),
  );

  useEffect(() => {
    if (!composeTo) return;
    setCompose({ open: true, mode: "new", to: composeTo });
    onComposeToConsumed?.();
  }, [composeTo, onComposeToConsumed]);

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
    setSelectMode(false);
    setSelectedIds(new Set());
    loadThreads().catch((err) => {
      if (!handleAuthError(err, onLogout, () => setNeedsScope(true))) {
        toast.error(err instanceof ApiError ? err.message : "Nachrichten fehlgeschlagen.");
      }
    });
  }, [loadThreads, onLogout]);

  async function openThread(id: string) {
    const summary = threads.find((t) => t.id === id);
    setFoldersOpen(false);
    try {
      const next = await apiClient.mailThread(id, threaded);
      if (next.draftId || next.draft || summary?.draft) {
        setCompose({
          open: true,
          mode: "draft",
          draftId: next.draftId ?? summary?.draftId ?? undefined,
          replyTo: next.messages[0],
        });
        return;
      }
      setSelectedId(id);
      setLoadingThread(true);
      if (!desktop) setMobilePane("thread");
      setThread(next);
      if (next.unread) {
        bumpUnread(unreadFolders(labelId), -1);
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

  function toggleSelect(id: string) {
    setSelectMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function selectAllVisible() {
    setSelectMode(true);
    setSelectedIds(new Set(threads.map((t) => t.id)));
  }

  async function removeFromList(ids: string[]) {
    const drop = new Set(ids);
    setThreads((ts) => ts.filter((t) => !drop.has(t.id)));
    if (selectedId && drop.has(selectedId)) {
      setThread(null);
      setSelectedId(null);
      if (!desktop) setMobilePane("list");
    }
    exitSelect();
  }

  async function archiveIds(ids: string[]) {
    if (!ids.length) return;
    const unreadN = ids.filter((id) => threads.find((t) => t.id === id)?.unread).length;
    await Promise.all(ids.map((id) => apiClient.mailModify(id, [], ["INBOX"], threaded)));
    bumpUnread(["INBOX"], -unreadN);
    await removeFromList(ids);
  }

  async function trashIds(ids: string[]) {
    if (!ids.length) return;
    const unreadN = ids.filter((id) => threads.find((t) => t.id === id)?.unread).length;
    if (labelId === "TRASH") {
      await Promise.all(ids.map((id) => apiClient.mailUntrash(id, threaded)));
    } else {
      await Promise.all(ids.map((id) => apiClient.mailTrash(id, threaded)));
      bumpUnread(unreadFolders(labelId), -unreadN);
    }
    await removeFromList(ids);
  }

  async function archive() {
    if (!selectedId) return;
    await archiveIds([selectedId]);
  }

  async function trash() {
    if (!selectedId) return;
    await trashIds([selectedId]);
  }

  async function toggleStar() {
    if (!selectedId || !thread) return;
    if (thread.starred) await apiClient.mailModify(selectedId, [], ["STARRED"], threaded);
    else await apiClient.mailModify(selectedId, ["STARRED"], [], threaded);
    setThread({ ...thread, starred: !thread.starred });
    setThreads((ts) => ts.map((t) => (t.id === selectedId ? { ...t, starred: !t.starred } : t)));
  }

  async function markUnread() {
    if (!selectedId) return;
    await apiClient.mailModify(selectedId, ["UNREAD"], [], threaded);
    bumpUnread(unreadFolders(labelId), 1);
    setThreads((ts) => ts.map((t) => (t.id === selectedId ? { ...t, unread: true } : t)));
    setThread((th) => (th ? { ...th, unread: true } : th));
    toast.success("Als ungelesen markiert.");
  }

  async function reportSpam() {
    if (!selectedId) return;
    await apiClient.mailModify(selectedId, ["SPAM"], ["INBOX"], threaded);
    setThreads((ts) => ts.filter((t) => t.id !== selectedId));
    setThread(null);
    setSelectedId(null);
    if (!desktop) setMobilePane("list");
    toast.success("Als Spam gemeldet.");
  }

  async function notSpam() {
    if (!selectedId) return;
    await apiClient.mailModify(selectedId, ["INBOX"], ["SPAM"], threaded);
    setThreads((ts) => ts.filter((t) => t.id !== selectedId));
    setThread(null);
    setSelectedId(null);
    if (!desktop) setMobilePane("list");
    toast.success("Kein Spam — im Posteingang.");
  }

  async function toggleLabel(label: string, on: boolean) {
    if (!selectedId || !thread) return;
    await apiClient.mailModify(selectedId, on ? [label] : [], on ? [] : [label], threaded);
    setThread({
      ...thread,
      messages: thread.messages.map((m) => ({
        ...m,
        labelIds: on
          ? [...new Set([...(m.labelIds ?? []), label])]
          : (m.labelIds ?? []).filter((id) => id !== label),
      })),
    });
  }

  async function setLabelColor(id: string, backgroundColor: string, textColor: string) {
    await apiClient.mailLabelColor(id, backgroundColor, textColor);
    setLabels((ls) =>
      ls.map((l) => (l.id === id ? { ...l, color: { backgroundColor, textColor } } : l)),
    );
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
          <div className="flex min-w-0 items-center gap-2">
            <AppLogo className="size-8" size={32} />
            <AppSwitcher className="flex-1" value={module} onChange={onModule} />
          </div>
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
      <p className="px-2.5 pb-1.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
        Postfächer
      </p>
      {systemLabels.map((label) => (
        <MailboxRow
          key={label.id}
          label={label}
          active={labelId === label.id}
          badge={labelBadgeCount(label, threaded)}
          onClick={() => {
            setLabelId(label.id);
            setFoldersOpen(false);
            if (!desktop) setMobilePane("list");
          }}
        />
      ))}
      {userLabels.length ? (
        <>
            <p className="mt-3 px-2.5 pb-1.5 text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
            Ordner
          </p>
          {userLabels.map((label) => (
            <div key={label.id} className="flex items-center gap-0.5">
              <div className="min-w-0 flex-1">
                <MailboxRow
                  label={label}
                  active={labelId === label.id}
                  badge={labelBadgeCount(label, threaded)}
                  onClick={() => {
                    setLabelId(label.id);
                    setFoldersOpen(false);
                    if (!desktop) setMobilePane("list");
                  }}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Ordnerfarbe" />
                  }
                >
                  <span
                    className="size-3 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: label.color?.backgroundColor ?? "#cccccc" }}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      const next = window.prompt("Neuer Name", label.name);
                      if (!next?.trim() || next.trim() === label.name) return;
                      void apiClient
                        .mailRenameLabel(label.id, next.trim())
                        .then(() =>
                          setLabels((ls) =>
                            ls.map((l) => (l.id === label.id ? { ...l, name: next.trim() } : l)),
                          ),
                        )
                        .catch((err) =>
                          toast.error(err instanceof ApiError ? err.message : "Umbenennen fehlgeschlagen."),
                        );
                    }}
                  >
                    Umbenennen
                  </DropdownMenuItem>
                  <div className="grid grid-cols-8 gap-1 p-2">
                    {GMAIL_LABEL_COLORS.map((c) => (
                      <button
                        key={c.backgroundColor}
                        type="button"
                        className="size-4 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: c.backgroundColor }}
                        aria-label={c.backgroundColor}
                        onClick={() =>
                          setLabelColor(label.id, c.backgroundColor, c.textColor).catch((err) =>
                            toast.error(err instanceof ApiError ? err.message : "Farbe fehlgeschlagen."),
                          )
                        }
                      />
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </>
      ) : null}
      <form
        className="mt-3 flex gap-1 px-1"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newLabel.trim();
          if (!name) return;
          void apiClient
            .mailCreateLabel(name)
            .then((created) => {
              setNewLabel("");
              setLabels((ls) => [
                ...ls,
                {
                  id: created.id,
                  name: created.name,
                  type: "user",
                  color: null,
                  messagesTotal: 0,
                  messagesUnread: 0,
                  threadsTotal: 0,
                  threadsUnread: 0,
                },
              ]);
            })
            .catch((err) =>
              toast.error(err instanceof ApiError ? err.message : "Ordner anlegen fehlgeschlagen."),
            );
        }}
      >
        <Input value={newLabel} onValueChange={setNewLabel} placeholder="Neuer Ordner" className="h-9" />
        <Button type="submit" variant="outline" className="h-9 px-2" disabled={!newLabel.trim()}>
          Anlegen
        </Button>
      </form>
    </nav>
  );

  const list = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-background">
      <div className="relative z-40 flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        {!desktop ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={foldersOpen ? "Ordner schliessen" : "Ordner öffnen"}
            aria-expanded={foldersOpen}
            onClick={() => {
              setFoldersOpen((v) => {
                if (!v) loadLabels().catch(() => undefined);
                return !v;
              });
            }}
          >
            <ChevronRight
              className={cn(
                "size-5 text-mail transition-transform duration-[750ms] ease-in-out",
                foldersOpen ? "rotate-0" : "-rotate-180",
              )}
            />
          </Button>
        ) : null}
        <h1 className="min-w-0 flex-1 break-words text-xl font-semibold leading-snug tracking-tight">
          {selectMode
            ? `${selectedIds.size} ausgewählt`
            : (activeLabel?.name ?? "Posteingang")}
        </h1>
        {selectMode ? (
          <>
            <Button variant="ghost" className="text-mail" onClick={selectAllVisible}>
              Alle
            </Button>
            <Button variant="ghost" className="text-mail" onClick={exitSelect}>
              Fertig
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Auswählen"
            aria-pressed={selectMode}
            onClick={() => setSelectMode(true)}
          >
            <CheckSquare className="size-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label={searchOpen ? "Suche ausblenden" : "Suche"}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className={cn("size-5", searchOpen || appliedQuery ? "text-mail" : undefined)} />
        </Button>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[750ms] ease-in-out",
          searchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <form
          className="min-h-0 overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onValueChange={setQuery}
                placeholder="Suchen (from:, to:, has:attachment …)"
                className="rounded-full bg-muted pl-9"
                aria-label="Mail durchsuchen"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                ["from:", "from:"],
                ["Anhang", "has:attachment"],
                ["Ungelesen", "is:unread"],
                ["Markiert", "is:starred"],
              ].map(([label, op]) => (
                <button
                  key={op}
                  type="button"
                  className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground"
                  onClick={() => setQuery((q) => (q.includes(op) ? q : `${q} ${op}`.trim()))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Nach dem"
                onValueChange={(v) => {
                  if (!v) return;
                  setQuery((q) => `${q.replace(/\bafter:\S+/g, "").trim()} after:${v}`.trim());
                }}
              />
              <Input
                type="date"
                aria-label="Vor dem"
                onValueChange={(v) => {
                  if (!v) return;
                  setQuery((q) => `${q.replace(/\bbefore:\S+/g, "").trim()} before:${v}`.trim());
                }}
              />
            </div>
          </div>
        </form>
      </div>
      <PullToRefresh
        onRefresh={async () => {
          await loadThreads();
          await loadLabels().catch(() => undefined);
        }}
        disabled={loadingList}
      >
        <div className={cn("min-h-0 flex-1 overflow-auto touch-pan-y", selectMode && "pb-24")}>
          {loadingList && !threads.length ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Laden…
            </div>
          ) : !threads.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Keine Nachrichten.</p>
          ) : (
            threads.map((item) => {
              const canArchive = labelId !== "TRASH" && labelId !== "DRAFT" && labelId !== "SENT" && labelId !== "SPAM";
              return (
                <SwipeableRow
                  key={item.id}
                  className="rounded-none border-b border-border"
                  disabled={selectMode}
                  onOpen={() => {
                    if (selectMode) toggleSelect(item.id);
                    else void openThread(item.id);
                  }}
                  actions={[
                    ...(canArchive
                      ? [
                          {
                            key: "archive",
                            label: "Archiv",
                            icon: <Archive className="size-5" />,
                            className: "bg-sky-600",
                            onClick: () =>
                              void archiveIds([item.id]).catch((err) =>
                                toast.error(err instanceof ApiError ? err.message : "Archivieren fehlgeschlagen."),
                              ),
                          },
                        ]
                      : []),
                    {
                      key: "unread",
                      label: "Ungelesen",
                      icon: <MailOpen className="size-5" />,
                      className: "bg-amber-600",
                      onClick: () =>
                        void apiClient
                          .mailModify(item.id, ["UNREAD"], [], threaded)
                          .then(() => {
                            setThreads((ts) =>
                              ts.map((t) => (t.id === item.id ? { ...t, unread: true } : t)),
                            );
                            bumpUnread(unreadFolders(labelId), item.unread ? 0 : 1);
                          })
                          .catch((err) =>
                            toast.error(err instanceof ApiError ? err.message : "Änderung fehlgeschlagen."),
                          ),
                    },
                    ...(userLabels.length
                      ? [
                          {
                            key: "label",
                            label: "Ordner",
                            icon: <FolderInput className="size-5" />,
                            className: "bg-violet-600",
                            onClick: () => setLabelPickId(item.id),
                          },
                        ]
                      : []),
                    ...(labelId === "TRASH"
                      ? [
                          {
                            key: "restore",
                            label: "Zurück",
                            icon: <Undo2 className="size-5" />,
                            className: "bg-sky-600",
                            onClick: () =>
                              void trashIds([item.id]).catch((err) =>
                                toast.error(err instanceof ApiError ? err.message : "Wiederherstellen fehlgeschlagen."),
                              ),
                          },
                        ]
                      : [
                          {
                            key: "delete",
                            label: "Löschen",
                            icon: <Trash2 className="size-5" />,
                            className: "bg-red-600",
                            onClick: () =>
                              void trashIds([item.id]).catch((err) =>
                                toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen."),
                              ),
                          },
                        ]),
                  ]}
                >
                  <ThreadRow
                    thread={item}
                    active={item.id === selectedId}
                    selected={selectedIds.has(item.id)}
                    selecting={selectMode}
                    selfEmail={me.email}
                    selfPhoto={me.pictureUrl}
                    threaded={threaded}
                    onToggleSelect={() => toggleSelect(item.id)}
                  />
                </SwipeableRow>
              );
            })
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
      {labelPickId ? (
        <div className="absolute inset-0 z-30 flex items-end bg-black/30 p-3" onClick={() => setLabelPickId(null)}>
          <div
            className="w-full rounded-2xl bg-card p-3 shadow-xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-1 pb-2 text-sm font-medium">In Ordner legen</p>
            <ul className="flex flex-col">
              {userLabels.map((label) => (
                <li key={label.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      void apiClient
                        .mailModify(labelPickId, [label.id], ["INBOX"], threaded)
                        .then(() => {
                          setThreads((ts) => ts.filter((t) => t.id !== labelPickId));
                          setLabelPickId(null);
                          toast.success(`Nach ${label.name} verschoben.`);
                        })
                        .catch((err) =>
                          toast.error(err instanceof ApiError ? err.message : "Verschieben fehlgeschlagen."),
                        )
                    }
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: label.color?.backgroundColor ?? "#ccc" }}
                    />
                    {label.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
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
      userLabels={userLabels}
      showBack={!desktop}
      onBack={() => {
        setMobilePane("list");
        setThread(null);
        setSelectedId(null);
      }}
      onReply={(message) => setCompose({ open: true, mode: "reply", replyTo: message })}
      onReplyAll={(message) => setCompose({ open: true, mode: "replyAll", replyTo: message })}
      onForward={(message) => setCompose({ open: true, mode: "forward", replyTo: message })}
      onArchive={() => archive().catch((err) => toast.error(err instanceof ApiError ? err.message : "Archivieren fehlgeschlagen."))}
      onTrash={() => trash().catch((err) => toast.error(err instanceof ApiError ? err.message : "Löschen fehlgeschlagen."))}
      onToggleStar={() => toggleStar().catch((err) => toast.error(err instanceof ApiError ? err.message : "Markierung fehlgeschlagen."))}
      onMarkUnread={() => markUnread().catch((err) => toast.error(err instanceof ApiError ? err.message : "Änderung fehlgeschlagen."))}
      onSpam={() => reportSpam().catch((err) => toast.error(err instanceof ApiError ? err.message : "Spam fehlgeschlagen."))}
      onNotSpam={() => notSpam().catch((err) => toast.error(err instanceof ApiError ? err.message : "Änderung fehlgeschlagen."))}
      onToggleLabel={(id, on) => toggleLabel(id, on).catch((err) => toast.error(err instanceof ApiError ? err.message : "Ordner fehlgeschlagen."))}
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
        <div className="flex min-w-0 items-center gap-2">
          <AppLogo className="size-8" size={32} />
          <AppSwitcher value={module} onChange={onModule} />
        </div>
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
      {selectMode ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-border bg-card px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {selectedIds.size ? `${selectedIds.size} ausgewählt` : "Nachrichten antippen"}
          </span>
          {labelId !== "TRASH" && labelId !== "DRAFT" && labelId !== "SENT" && labelId !== "SPAM" ? (
            <Button
              variant="outline"
              disabled={!selectedIds.size}
              onClick={() =>
                void archiveIds([...selectedIds]).catch((err) =>
                  toast.error(err instanceof ApiError ? err.message : "Archivieren fehlgeschlagen."),
                )
              }
            >
              <Archive className="size-4" />
              Archiv
            </Button>
          ) : null}
          <Button
            variant="destructive"
            disabled={!selectedIds.size}
            onClick={() =>
              void trashIds([...selectedIds]).catch((err) =>
                toast.error(
                  err instanceof ApiError
                    ? err.message
                    : labelId === "TRASH"
                      ? "Wiederherstellen fehlgeschlagen."
                      : "Löschen fehlgeschlagen.",
                ),
              )
            }
          >
            {labelId === "TRASH" ? <Undo2 className="size-4" /> : <Trash2 className="size-4" />}
            {labelId === "TRASH" ? "Zurück" : "Löschen"}
          </Button>
        </div>
      ) : (
        <Button
          className="fixed right-4 bottom-6 z-40 size-14 rounded-full bg-mail text-mail-foreground shadow-lg hover:bg-mail/90"
          size="icon"
          aria-label="Neue Nachricht"
          onClick={() => setCompose({ open: true, mode: "new" })}
        >
          <Pencil className="size-6" />
        </Button>
      )}
      {compose.open ? (
        <ComposeSheet
          key={`${compose.mode}-${compose.replyTo?.id ?? "new"}-${compose.draftId ?? ""}`}
          state={compose}
          desktop={desktop}
          selfEmail={me.email}
          onOpenChange={(open) => setCompose(open ? compose : { open: false })}
          onReconnect={() => setNeedsScope(true)}
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
