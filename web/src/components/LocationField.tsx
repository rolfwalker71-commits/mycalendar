import { useEffect, useRef, useState } from "react";
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
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const timer = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      apiClient
        .mapsSuggest(q)
        .then((res) => setItems(res.places))
        .catch(() => setItems([]));
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  function pick(place: PlaceSuggestion) {
    onValueChange(place.label);
    onPlace?.(place);
    setItems([]);
    setOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label htmlFor={id}>Ort</Label>
      <Input
        id={id}
        value={value}
        onValueChange={onValueChange}
        placeholder="Adresse oder Ort suchen"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
      />
      {open && items.length ? (
        <ul className="absolute top-full z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl bg-popover py-1 shadow-lg ring-1 ring-border">
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
        </ul>
      ) : null}
    </div>
  );
}
