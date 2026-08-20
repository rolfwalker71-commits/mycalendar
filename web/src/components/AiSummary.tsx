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
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
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
