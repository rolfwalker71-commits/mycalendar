import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

export type PlaceSuggestion = { label: string; lat: number; lon: number };

export function LocationField({
  id,
  value,
  onValueChange,
  onPlace,
}: {
  id: string;
  value: string;
  onValueChange: (next: string) => void;
  onPlace?: (place: PlaceSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  function measure() {
    const el = wrapRef.current?.querySelector("input");
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    timer.current = window.setTimeout(() => {
      apiClient
        .mapsSuggest(q, { signal: ac.signal })
        .then((res) => {
          if (ac.signal.aborted) return;
          setItems(res.places);
        })
        .catch(() => {
          if (!ac.signal.aborted) setItems([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer.current);
      ac.abort();
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, items, loading]);

  function pick(place: PlaceSuggestion) {
    onValueChange(place.label);
    onPlace?.(place);
    setItems([]);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>Ort</Label>
      <Input
        id={id}
        value={value}
        onValueChange={onValueChange}
        placeholder="Adresse, Ort oder Firma"
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          measure();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
      />
      {open && box && (items.length > 0 || loading)
        ? createPortal(
            <ul
              className="fixed z-[1200] max-h-56 overflow-auto rounded-xl bg-popover py-1 shadow-lg ring-1 ring-border"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
              {items.map((place) => (
                <li key={`${place.label}-${place.lat}`}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(place)}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
              {loading && !items.length ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">Suche…</li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
