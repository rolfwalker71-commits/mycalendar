import { useEffect, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatIsoDate, parseDateInput, parseTimeInput } from "@/lib/dates";

type FieldProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
};

export function DateField({ id, value, onValueChange }: FieldProps) {
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
      <div className="absolute inset-y-0 right-0 w-11">
        <input
          type="date"
          lang="de-DE"
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <Calendar className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

export function TimeField({ id, value, onValueChange }: FieldProps) {
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
      <div className="absolute inset-y-0 right-0 w-11">
        <input
          type="time"
          lang="de-DE"
          step={60}
          tabIndex={-1}
          aria-hidden
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <Clock className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
