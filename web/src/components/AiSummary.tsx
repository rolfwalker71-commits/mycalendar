import type { ReactNode } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HighlightCard = {
  type: string;
  title: string;
  lines: string[];
};

export function HighlightCards({ cards }: { cards: HighlightCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {cards.map((card, i) => (
        <article
          key={`${card.type}-${i}`}
          className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {card.type}
          </p>
          <p className="mt-1 font-semibold">{card.title}</p>
          {card.lines.map((line) => (
            <p key={line} className="mt-0.5 text-sm text-muted-foreground">
              {line}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}

export function GeminiCard({
  title,
  text,
  loading,
  available,
  onGenerate,
  className,
}: {
  title: string;
  text?: string | null;
  loading?: boolean;
  available?: boolean;
  onGenerate?: () => void;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-4 mt-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-sky-500/10 px-4 py-3 ring-1 ring-violet-500/20",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {loading ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              Gemini fasst zusammen…
            </p>
          ) : text ? (
            <GeminiBody text={text} />
          ) : available === false ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Die Gemini-Übersichten aus Gmail selbst liefert Google nicht per Schnittstelle.
              Mit einem API-Schlüssel in <code className="text-xs">GEMINI_API_KEY</code> entstehen
              hier eigene Zusammenfassungen.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Kurze Zusammenfassung von Gemini, aus dem Inhalt hier — nicht die gespeicherte
              Gmail-Übersicht.
            </p>
          )}
          {onGenerate && available !== false ? (
            <Button
              variant="ghost"
              className="mt-2 h-9 px-0 text-violet-600 dark:text-violet-300"
              disabled={loading}
              onClick={onGenerate}
            >
              {text ? "Neu zusammenfassen" : "Zusammenfassen"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const LABEL_LINE = /^(?:[-*•]\s+)?\*\*(.+?):\*\*\s*(.*)$/;

function stripFence(text: string): string {
  return text
    .replace(/^```(?:markdown|md|json|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+?\*\*|__[^_]+?__|\*[^*]+?\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const raw = match[0];
    const inner = raw.replace(/^\*\*|^__|^\*|\*\*$|__$|\*$/g, "");
    nodes.push(
      raw.startsWith("*") && !raw.startsWith("**") ? (
        <em key={i++}>{inner}</em>
      ) : (
        <strong key={i++} className="font-semibold">
          {inner}
        </strong>
      ),
    );
    last = match.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : nodes;
}

function parseLabelRows(text: string): { label: string; value: string }[] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const matched = lines.map((line) => line.match(LABEL_LINE));
  if (matched.filter(Boolean).length < Math.ceil(lines.length * 0.6)) return null;
  return matched.map((row, i) =>
    row ? { label: row[1].trim(), value: row[2].trim() } : { label: "", value: lines[i] },
  );
}

function GeminiBlocks({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, "").trim());
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="mt-1.5 list-disc space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "").trim());
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="mt-1.5 list-decimal space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={key++} className="mt-1.5 first:mt-1">
        {renderInline(para.join(" "))}
      </p>,
    );
  }
  return <>{blocks}</>;
}

function GeminiBody({ text }: { text: string }) {
  const raw = stripFence(text);
  const facts = parseLabelRows(raw);
  if (facts) {
    return (
      <dl className="mt-2 space-y-2.5">
        {facts.map((row, i) => (
          <div key={`${row.label}-${i}`}>
            {row.label ? (
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
            ) : null}
            <dd className="text-sm leading-relaxed">{renderInline(row.value || "—")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="mt-1 text-sm leading-relaxed">
      <GeminiBlocks text={raw} />
    </div>
  );
}
