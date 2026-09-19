import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: [Theme, string][] = [
  ["light", "Hell"],
  ["dark", "Dunkel"],
  ["system", "System"],
];

/** Light / dark / follow the device (iOS Control Center, Auto-Erscheinungsbild). */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Erscheinungsbild" className={cn("rounded-full bg-muted p-0.5", className)}>
      <div className="grid grid-cols-3 gap-0.5">
        {OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            className={cn(
              "min-h-9 rounded-full px-2 text-sm font-medium leading-tight",
              theme === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
