import { useEffect, useRef } from "react";
import { Bold, Italic, Link, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HtmlEditor({
  html,
  onChange,
  resetKey,
  className,
}: {
  html: string;
  onChange: (html: string) => void;
  resetKey: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== html) el.innerHTML = html || "";
  }, [resetKey]);

  function cmd(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "");
  }

  function addLink() {
    const url = window.prompt("Link-Adresse", "https://");
    if (!url) return;
    cmd("createLink", url);
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-input bg-card", className)}>
      <div className="flex gap-0.5 border-b border-border px-1 py-1">
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => cmd("bold")} aria-label="Fett">
          <Bold className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => cmd("italic")} aria-label="Kursiv">
          <Italic className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => cmd("insertUnorderedList")} aria-label="Liste">
          <List className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={addLink} aria-label="Link">
          <Link className="size-4" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-label="Nachricht"
        className="min-h-48 px-3 py-2 text-base outline-none md:text-sm"
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
      />
    </div>
  );
}
