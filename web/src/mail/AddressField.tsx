import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AddressField({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  onReconnect,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  onReconnect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ name: string; email: string }[]>([]);
  const [missing, setMissing] = useState(false);
  const t = useRef<number>(0);

  useEffect(() => {
    const last = value.split(/[,;]/).pop()?.trim() ?? "";
    window.clearTimeout(t.current);
    if (last.length < 2) {
      setItems([]);
      return;
    }
    t.current = window.setTimeout(() => {
      apiClient
        .mailContacts(last)
        .then((res) => {
          setItems(res.contacts);
          setMissing(false);
        })
        .catch((err) => {
          if (err instanceof ApiError && (err.code === "contacts_scope" || err.code === "api_disabled")) {
            setMissing(true);
            onReconnect?.();
          }
          setItems([]);
        });
    }, 250);
    return () => window.clearTimeout(t.current);
  }, [value, onReconnect]);

  function pick(email: string) {
    const parts = value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    parts.pop();
    parts.push(email);
    onValueChange(parts.join(", ") + ", ");
    setItems([]);
    setOpen(false);
  }

  return (
    <div className="relative grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {missing ? (
        <p className="text-xs text-muted-foreground">
          Kontakte nicht verfügbar.{" "}
          <a className="text-mail underline" href="/api/auth/google">
            Google erneut verbinden
          </a>
        </p>
      ) : null}
      {open && items.length ? (
        <ul className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
          {items.map((c) => (
            <li key={c.email}>
              <button
                type="button"
                className={cn("flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c.email);
                }}
              >
                <span className="truncate font-medium">{c.name || c.email}</span>
                {c.name ? <span className="truncate text-xs text-muted-foreground">{c.email}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
