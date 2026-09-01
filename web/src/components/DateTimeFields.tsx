import { useEffect, useRef, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatIsoDate, parseDateInput, parseTimeInput } from "@/lib/dates";

type FieldProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
};

function openNativePicker(el: HTMLInputElement | null) {
  if (!el) return;
  // Anchor the native popover in the viewport so overflow:auto sheets cannot clip it.
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.top = "28%";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  try {
    el.focus({ preventScroll: true });
    if (typeof el.showPicker === "function") {
      el.showPicker();
      return;
    }
  } catch {
    /* InvalidStateError if not triggered by a gesture — fall through */
  }
  el.click();
}

export function DateField({ id, value, onValueChange }: FieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => formatIsoDate(value));

  useEffect(() => {
    setText(formatIsoDate(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = parseDateInput(raw);
    if (parsed === null) {
      setText(formatIsoDate(value));
      return;
    }
    onValueChange(parsed);
    setText(formatIsoDate(parsed));
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="tt.mm.jjjj"
        value={text}
        onValueChange={setText}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
        }}
        className="pr-11"
      />
      <input
        ref={pickerRef}
        type="date"
        lang="de-DE"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      <button
        type="button"
        aria-label="Datum wählen"
        className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-muted-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => openNativePicker(pickerRef.current)}
      >
        <Calendar className="size-4" />
      </button>
    </div>
  );
}

export function TimeField({ id, value, onValueChange }: FieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => parseTimeInput(value) || value);

  useEffect(() => {
    setText(parseTimeInput(value) || value);
  }, [value]);

  function commit(raw: string) {
    const parsed = parseTimeInput(raw);
    if (parsed === null) {
      setText(parseTimeInput(value) || value);
      return;
    }
    onValueChange(parsed);
    setText(parsed);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="hh:mm"
        value={text}
        onValueChange={setText}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
        }}
        className="pr-11"
      />
      <input
        ref={pickerRef}
        type="time"
        lang="de-DE"
        step={60}
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="pointer-events-none absolute h-px w-px opacity-0"
      />
      <button
        type="button"
        aria-label="Uhrzeit wählen"
        className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-muted-foreground"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => openNativePicker(pickerRef.current)}
      >
        <Clock className="size-4" />
      </button>
    </div>
  );
}
